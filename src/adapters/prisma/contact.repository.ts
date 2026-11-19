import type { ContactId, Seq } from '@/core/domain';
import type { ContactFilter, ContactListCursor, ContactRepository } from '@/core/ports';
import { toContact, toNewContactRow } from './contact.mapper';
import { Prisma, type Contact as ContactRow } from './generated/client';
import type { PrismaClient } from './prisma-client';

// Rules of docs/architecture/data-model.md "กฎของ repository". Every write is one statement whose
// WHERE carries the condition, so Postgres row locks make concurrent callers see one winner, and the
// "Contact_updated_seq" trigger gives every written row a new updatedSeq.

/** LIKE pattern for a literal "contains" match: `\`, `%` and `_` in the needle match themselves. */
const containsPattern = (needle: string): string =>
  `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const filterCondition = (filter: ContactFilter): Prisma.Sql => {
  switch (filter) {
    case 'all':
      return Prisma.sql`TRUE`;
    case 'unread':
      return Prisma.sql`"unreadCount" > 0`;
    case 'needs_admin':
      return Prisma.sql`"needsAdmin" = TRUE`;
  }
};

const sortAtOf = (row: ContactRow): Date => row.lastMessageAt ?? row.createdAt;

export function createContactRepository(client: PrismaClient): ContactRepository {
  const findById: ContactRepository['findById'] = async (id) => {
    const row = await client.contact.findUnique({ where: { id } });
    return row ? toContact(row) : null;
  };

  const ensure: ContactRepository['ensure'] = async (input) => {
    // INSERT ... ON CONFLICT DO NOTHING, then read by the unique key (rule 3).
    const { count } = await client.contact.createMany({
      data: [toNewContactRow(input)],
      skipDuplicates: true,
    });
    const row = await client.contact.findUnique({ where: { lineUserId: input.lineUserId } });
    if (!row) throw new Error('ContactRepository.ensure: id already used by another lineUserId');
    return { contact: toContact(row), created: count === 1 };
  };

  const updateProfile: ContactRepository['updateProfile'] = async (id, p) => {
    await client.contact.updateMany({
      where: { id },
      data: { displayName: p.displayName, pictureUrl: p.pictureUrl },
    });
  };

  const setFollowStatus: ContactRepository['setFollowStatus'] = async (id, status, at) => {
    const data: Prisma.ContactUpdateManyMutationInput =
      status === 'following'
        ? { followStatus: status, followedAt: at }
        : { followStatus: status, replyToken: null, replyTokenExpiresAt: null };
    await client.contact.updateMany({ where: { id }, data });
  };

  const recordInbound: ContactRepository['recordInbound'] = async (id, i) => {
    // One statement (rule 4). Every CASE reads the old row, so the last inbound time (the list's
    // sort key) and the preview move only when the new message is not older than the latest
    // inbound one, and the reply token only when its expiry is later.
    const isLatest = Prisma.sql`("lastMessageAt" IS NULL OR "lastMessageAt" <= ${i.at}::timestamptz)`;
    const tokenIsNewer = Prisma.sql`(${i.replyToken}::text IS NOT NULL
      AND ${i.replyTokenExpiresAt}::timestamptz IS NOT NULL
      AND ("replyTokenExpiresAt" IS NULL OR "replyTokenExpiresAt" < ${i.replyTokenExpiresAt}::timestamptz))`;
    await client.$executeRaw`
      UPDATE "Contact" SET
        "unreadCount" = "unreadCount" + 1,
        "lastMessageAt" = CASE WHEN ${isLatest} THEN ${i.at}::timestamptz ELSE "lastMessageAt" END,
        "lastMessagePreview" = CASE WHEN ${isLatest} THEN ${i.preview.text}::text ELSE "lastMessagePreview" END,
        "lastMessageType" = CASE WHEN ${isLatest} THEN ${i.preview.type}::"MessageType" ELSE "lastMessageType" END,
        "lastMessageBy" = CASE WHEN ${isLatest} THEN 'customer'::"MessageAuthor" ELSE "lastMessageBy" END,
        "replyToken" = CASE WHEN ${tokenIsNewer} THEN ${i.replyToken}::text ELSE "replyToken" END,
        "replyTokenExpiresAt" = CASE WHEN ${tokenIsNewer} THEN ${i.replyTokenExpiresAt}::timestamptz ELSE "replyTokenExpiresAt" END
      WHERE "id" = ${id}::uuid`;
  };

  const recordOutbound: ContactRepository['recordOutbound'] = async (id, o) => {
    await client.contact.updateMany({
      where: { id },
      // The preview follows every message; `lastMessageAt` is the latest inbound time and the
      // sort key of the list, so a reply from the shop does not move the chat (rule 4).
      data: {
        lastMessagePreview: o.preview.text,
        lastMessageType: o.preview.type,
        lastMessageBy: o.by,
      },
    });
  };

  const consumeReplyToken: ContactRepository['consumeReplyToken'] = async (id, replyToken) => {
    // Compare-and-clear (rule 9).
    const { count } = await client.contact.updateMany({
      where: { id, replyToken },
      data: { replyToken: null, replyTokenExpiresAt: null },
    });
    return count === 1;
  };

  const setAiEnabled: ContactRepository['setAiEnabled'] = async (id, enabled) => {
    await client.contact.updateMany({ where: { id }, data: { aiEnabled: enabled } });
  };

  const setNeedsAdmin: ContactRepository['setNeedsAdmin'] = async (id, reason) => {
    await client.contact.updateMany({
      where: { id },
      data: { needsAdmin: true, needsAdminReason: reason },
    });
  };

  const clearNeedsAdmin: ContactRepository['clearNeedsAdmin'] = async (id) => {
    await client.contact.updateMany({
      where: { id },
      data: { needsAdmin: false, needsAdminReason: null },
    });
  };

  const markRead: ContactRepository['markRead'] = async (id) => {
    await client.contact.updateMany({ where: { id }, data: { unreadCount: 0 } });
  };

  const tryAcquireAiLock: ContactRepository['tryAcquireAiLock'] = async (id, now) => {
    // Conditional update (rule 8): a later caller waits for the row lock, then sees `replying`.
    const { count } = await client.contact.updateMany({
      where: { id, aiState: 'idle' },
      data: { aiState: 'replying', aiStateAt: now },
    });
    return count === 1;
  };

  const releaseAiLock: ContactRepository['releaseAiLock'] = async (id) => {
    await client.contact.updateMany({ where: { id }, data: { aiState: 'idle', aiStateAt: null } });
  };

  const recoverStuckAiStates: ContactRepository['recoverStuckAiStates'] = async (staleBefore) => {
    const rows = await client.$queryRaw<{ id: string }[]>`
      UPDATE "Contact" SET
        "aiState" = 'idle', "aiStateAt" = NULL,
        "needsAdmin" = TRUE, "needsAdminReason" = 'ai_timeout'
      WHERE "aiState" = 'replying' AND "aiStateAt" < ${staleBefore}::timestamptz
      RETURNING "id"`;
    return rows.map((r) => r.id as ContactId); // brand: ids returned by the Contact table
  };

  const list: ContactRepository['list'] = async ({ filter, search, before, limit }) => {
    const sortAt = Prisma.sql`COALESCE("lastMessageAt", "createdAt")`;
    const conditions: Prisma.Sql[] = [filterCondition(filter)];
    if (search !== null) {
      conditions.push(Prisma.sql`"displayName" ILIKE ${containsPattern(search)} ESCAPE '\\'`);
    }
    if (before !== null) {
      conditions.push(
        Prisma.sql`(${sortAt}, "id") < (${before.sortAt}::timestamptz, ${before.id}::uuid)`,
      );
    }
    // Raw rows carry the same column names and JS types as the generated Contact model.
    const rows = await client.$queryRaw<ContactRow[]>`
      SELECT * FROM "Contact"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${sortAt} DESC, "id" DESC
      LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const next: ContactListCursor | null =
      rows.length > limit && last
        ? { sortAt: sortAtOf(last), id: last.id as ContactId } // brand: id read from Contact
        : null;
    return { contacts: page.map(toContact), next };
  };

  const listChangedAfter: ContactRepository['listChangedAfter'] = async (after, limit) => {
    const rows = await client.contact.findMany({
      where: { updatedSeq: { gt: after } },
      orderBy: { updatedSeq: 'asc' },
      take: limit + 1,
    });
    return { contacts: rows.slice(0, limit).map(toContact), hasMore: rows.length > limit };
  };

  const maxUpdatedSeq: ContactRepository['maxUpdatedSeq'] = async () => {
    const { _max } = await client.contact.aggregate({ _max: { updatedSeq: true } });
    return (_max.updatedSeq ?? 0n) as Seq; // brand: max of change_seq values, or 0n when empty
  };

  const countByFilter: ContactRepository['countByFilter'] = async () => {
    // One statement so the three counts come from the same snapshot.
    const [row] = await client.$queryRaw<{ all: number; unread: number; needsAdmin: number }[]>`
      SELECT
        COUNT(*)::int AS "all",
        (COUNT(*) FILTER (WHERE "unreadCount" > 0))::int AS "unread",
        (COUNT(*) FILTER (WHERE "needsAdmin"))::int AS "needsAdmin"
      FROM "Contact"`;
    if (!row) throw new Error('ContactRepository.countByFilter: aggregate returned no row');
    return { all: row.all, unread: row.unread, needsAdmin: row.needsAdmin };
  };

  return {
    findById,
    ensure,
    updateProfile,
    setFollowStatus,
    recordInbound,
    recordOutbound,
    consumeReplyToken,
    setAiEnabled,
    setNeedsAdmin,
    clearNeedsAdmin,
    markRead,
    tryAcquireAiLock,
    releaseAiLock,
    recoverStuckAiStates,
    list,
    listChangedAfter,
    maxUpdatedSeq,
    countByFilter,
  };
}
