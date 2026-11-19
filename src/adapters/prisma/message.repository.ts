import {
  EVENT_CODES,
  NO_AI_TAP_EVENT_CODES,
  type EventCode,
  type Message,
  type MessageId,
  type Seq,
} from '@/core/domain';
import type { MessageRepository, NewMessage } from '@/core/ports';
import type { Message as MessageRow, Prisma } from './generated/client';
import { toMessage, toNewMessageRow } from './message.mapper';
import type { PrismaClient } from './prisma-client';

// Rules of docs/architecture/data-model.md "กฎของ repository". `seq` comes from change_seq as the
// column default and the "Message_updated_seq" trigger sets `updatedSeq` on every insert and update.

const EVENT_CODE_SET: ReadonlySet<string> = new Set(EVENT_CODES);

/** Newest `limit` rows (read newest first with one extra row) returned oldest first. */
const olderPage = (
  rows: MessageRow[],
  limit: number,
): { messages: Message[]; hasOlder: boolean } => ({
  messages: rows.slice(0, limit).reverse().map(toMessage),
  hasOlder: rows.length > limit,
});

export function createMessageRepository(client: PrismaClient): MessageRepository {
  /**
   * INSERT ... ON CONFLICT DO NOTHING, then read the row by its unique key (rules 1 and 2). A
   * concurrent insert of the same key makes ON CONFLICT wait for that transaction, so the read
   * that follows sees the winner's row.
   */
  const insertIfAbsent = async (
    m: NewMessage,
    existing: Prisma.MessageWhereUniqueInput,
  ): Promise<{ inserted: boolean; message: Message }> => {
    const { count } = await client.message.createMany({
      data: [toNewMessageRow(m)],
      skipDuplicates: true,
    });
    const row = await client.message.findUnique({ where: count === 1 ? { id: m.id } : existing });
    if (!row) throw new Error('MessageRepository: insert skipped on a conflict with another key');
    return { inserted: count === 1, message: toMessage(row) };
  };

  const findById: MessageRepository['findById'] = async (id) => {
    const row = await client.message.findUnique({ where: { id } });
    return row ? toMessage(row) : null;
  };

  const insertInboundIfAbsent: MessageRepository['insertInboundIfAbsent'] = (m) =>
    insertIfAbsent(
      m,
      m.lineMessageId !== null
        ? { lineMessageId: m.lineMessageId }
        : m.webhookEventId
          ? { webhookEventId: m.webhookEventId }
          : { id: m.id },
    );

  const insertOutboundIfAbsent: MessageRepository['insertOutboundIfAbsent'] = (m) =>
    insertIfAbsent(m, { id: m.id });

  const insertEvent: MessageRepository['insertEvent'] = async (m) =>
    toMessage(await client.message.create({ data: toNewMessageRow(m) }));

  // `update` throws when the row is missing, which is a bug for these two methods.
  const markSent: MessageRepository['markSent'] = async (id, at, lineSentIds) =>
    toMessage(
      await client.message.update({
        where: { id },
        data: {
          deliveryStatus: 'sent',
          deliveryError: null,
          sentAt: at,
          lineSentIds: { set: [...lineSentIds] },
        },
      }),
    );

  const markFailed: MessageRepository['markFailed'] = async (id, code) =>
    toMessage(
      await client.message.update({
        where: { id },
        data: { deliveryStatus: 'failed', deliveryError: code },
      }),
    );

  const markPendingIfFailed: MessageRepository['markPendingIfFailed'] = async (id, at) => {
    // Compare-and-set: the WHERE is re-checked after the row lock, so one caller wins.
    const { count } = await client.message.updateMany({
      where: { id, deliveryStatus: 'failed' },
      data: { deliveryStatus: 'pending', deliveryError: null, deliveryAttemptAt: at },
    });
    return count === 1;
  };

  const recordFirstPush: MessageRepository['recordFirstPush'] = async (id, at) => {
    // Compare-and-set on NULL: only the first push dates the retry key window.
    await client.message.updateMany({
      where: { id, firstPushAt: null },
      data: { firstPushAt: at },
    });
  };

  // Compare-and-set on pending, like markPendingIfFailed: one StoreInboundMedia run finishes it.
  const setMediaReady: MessageRepository['setMediaReady'] = async (id, mediaUrl, previewUrl) => {
    const { count } = await client.message.updateMany({
      where: { id, mediaStatus: 'pending' },
      data: { mediaStatus: 'ready', mediaUrl, previewUrl },
    });
    return count === 1;
  };

  const setMediaStatus: MessageRepository['setMediaStatus'] = async (id, status, failure) => {
    const { count } = await client.message.updateMany({
      where: { id, mediaStatus: 'pending' },
      data: {
        mediaStatus: status,
        mediaFailure: status === 'failed' ? (failure ?? 'download_failed') : null,
      },
    });
    return count === 1;
  };

  // Recovery of rows left behind by a function that was stopped (data-model rule 13). One UPDATE
  // each: a concurrent caller waits for the row lock, then no longer sees `pending`.
  const failStuckMedia: MessageRepository['failStuckMedia'] = async (contactId, staleBefore) => {
    const rows = await client.$queryRaw<{ id: string }[]>`
      UPDATE "Message" SET "mediaStatus" = 'failed', "mediaFailure" = 'interrupted'
      WHERE "contactId" = ${contactId}::uuid
        AND "mediaStatus" = 'pending'
        AND "createdAt" < ${staleBefore}::timestamptz
      RETURNING "id"`;
    return rows.map((r) => r.id as MessageId); // brand: ids returned by the Message table
  };

  const failStuckDeliveries: MessageRepository['failStuckDeliveries'] = async (
    contactId,
    staleBefore,
  ) => {
    const rows = await client.$queryRaw<{ id: string }[]>`
      UPDATE "Message" SET "deliveryStatus" = 'failed', "deliveryError" = 'line.send_interrupted'
      WHERE "contactId" = ${contactId}::uuid
        AND "deliveryStatus" = 'pending'
        AND COALESCE("deliveryAttemptAt", "createdAt") < ${staleBefore}::timestamptz
      RETURNING "id"`;
    return rows.map((r) => r.id as MessageId); // brand: ids returned by the Message table
  };

  const latestInbound: MessageRepository['latestInbound'] = async (contactId) => {
    const row = await client.message.findFirst({
      where: {
        contactId,
        direction: 'inbound',
        // A plain NOT IN would also drop rows whose eventCode is NULL.
        OR: [{ eventCode: null }, { eventCode: { notIn: [...NO_AI_TAP_EVENT_CODES] } }],
      },
      orderBy: { seq: 'desc' },
    });
    return row ? toMessage(row) : null;
  };

  const recentForAi: MessageRepository['recentForAi'] = async (contactId, limit) => {
    const rows = await client.message.findMany({
      where: { contactId, type: { not: 'event' } },
      orderBy: { seq: 'desc' },
      take: limit,
    });
    return rows.reverse().map(toMessage);
  };

  const listLatest: MessageRepository['listLatest'] = async (contactId, limit) =>
    olderPage(
      await client.message.findMany({
        where: { contactId },
        orderBy: { seq: 'desc' },
        take: limit + 1,
      }),
      limit,
    );

  const listBefore: MessageRepository['listBefore'] = async (contactId, beforeSeq, limit) =>
    olderPage(
      await client.message.findMany({
        where: { contactId, seq: { lt: beforeSeq } },
        orderBy: { seq: 'desc' },
        take: limit + 1,
      }),
      limit,
    );

  const listChangedAfter: MessageRepository['listChangedAfter'] = async (
    contactId,
    after,
    limit,
  ) => {
    const rows = await client.message.findMany({
      where: { contactId, updatedSeq: { gt: after } },
      orderBy: { updatedSeq: 'asc' },
      take: limit + 1,
    });
    return { messages: rows.slice(0, limit).map(toMessage), hasMore: rows.length > limit };
  };

  const maxUpdatedSeq: MessageRepository['maxUpdatedSeq'] = async (contactId) => {
    const { _max } = await client.message.aggregate({
      where: { contactId },
      _max: { updatedSeq: true },
    });
    return (_max.updatedSeq ?? 0n) as Seq; // brand: max of change_seq values, or 0n when none
  };

  const findByLineIds: MessageRepository['findByLineIds'] = async (contactId, lineIds) => {
    if (lineIds.length === 0) return [];
    const ids = [...new Set(lineIds)];
    const rows = await client.message.findMany({
      where: {
        contactId,
        OR: [{ lineMessageId: { in: ids } }, { lineSentIds: { hasSome: ids } }],
      },
      orderBy: { seq: 'asc' },
    });
    return rows.map(toMessage);
  };

  const countForContact: MessageRepository['countForContact'] = async (contactId) => {
    // One statement so both counts come from the same snapshot.
    const [row] = await client.$queryRaw<{ total: number; byAi: number }[]>`
      SELECT
        COUNT(*)::int AS "total",
        (COUNT(*) FILTER (WHERE "author" = 'ai'))::int AS "byAi"
      FROM "Message"
      WHERE "contactId" = ${contactId}::uuid AND "type" <> 'event'`;
    if (!row) throw new Error('MessageRepository.countForContact: aggregate returned no row');
    return { total: row.total, byAi: row.byAi };
  };

  const countEventsByCode: MessageRepository['countEventsByCode'] = async (range) => {
    const rows = await client.$queryRaw<{ eventCode: string; count: number }[]>`
      SELECT "eventCode", COUNT(*)::int AS "count"
      FROM "Message"
      WHERE "type" = 'event'
        AND "eventCode" IS NOT NULL
        AND "createdAt" >= ${range.from}::timestamptz
        AND "createdAt" < ${range.to}::timestamptz
      GROUP BY "eventCode"`;
    const counts: Partial<Record<EventCode, number>> = {};
    for (const r of rows) {
      // A plain text column; a value outside EVENT_CODES is a bug, as in message.mapper.ts.
      if (!EVENT_CODE_SET.has(r.eventCode))
        throw new Error('Message.eventCode holds an unknown code');
      counts[r.eventCode as EventCode] = r.count; // brand: checked against EVENT_CODES above
    }
    return counts;
  };

  return {
    findById,
    insertInboundIfAbsent,
    insertOutboundIfAbsent,
    insertEvent,
    markSent,
    markFailed,
    markPendingIfFailed,
    recordFirstPush,
    setMediaReady,
    setMediaStatus,
    failStuckMedia,
    failStuckDeliveries,
    latestInbound,
    recentForAi,
    listLatest,
    listBefore,
    listChangedAfter,
    maxUpdatedSeq,
    findByLineIds,
    countForContact,
    countEventsByCode,
  };
}
