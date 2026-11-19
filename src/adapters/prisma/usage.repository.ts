import type { ContactId, NanoUsd } from '@/core/domain';
import type { DateRange, UsageByContactRow, UsageRepository } from '@/core/ports';
import type { PrismaClient } from './prisma-client';
import { decimalStringToNano, nanoToDecimalString } from './money.mapper';
import { sumTokenUsage, toAiUsageRecord } from './usage.mapper';

interface ReportRow {
  contactId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  replyCount: bigint;
  okCount: bigint;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens: bigint;
  cost: string;
}

const ZERO_NANO = 0n as NanoUsd; // brand: zero

export function createUsageRepository(client: PrismaClient): UsageRepository {
  /** Count, token sums and cost of one kind in [from, to). No rows gives zeros. */
  const summaryOf = async (kind: 'ingest' | 'guard', range: DateRange) => {
    const r = await client.aiUsage.aggregate({
      where: { kind, createdAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
        costUsd: true,
      },
    });
    return {
      count: r._count._all,
      usage: sumTokenUsage(r._sum),
      cost: r._sum.costUsd === null ? ZERO_NANO : decimalStringToNano(r._sum.costUsd.toFixed(9)),
    };
  };

  return {
    async insert(r) {
      await client.aiUsage.create({
        data: {
          id: r.id,
          kind: r.kind,
          contactId: r.contactId,
          messageId: r.messageId,
          documentId: r.documentId,
          provider: r.provider,
          model: r.model,
          inputTokens: r.usage.inputTokens,
          outputTokens: r.usage.outputTokens,
          cacheReadTokens: r.usage.cacheReadTokens,
          cacheWriteTokens: r.usage.cacheWriteTokens,
          costUsd: nanoToDecimalString(r.cost),
          outcome: r.outcome,
          error: r.error,
          createdAt: r.createdAt,
        },
      });
    },

    async sumCost(range) {
      const r = await client.aiUsage.aggregate({
        where: { createdAt: { gte: range.from, lt: range.to } },
        _sum: { costUsd: true },
      });
      return r._sum.costUsd === null ? ZERO_NANO : decimalStringToNano(r._sum.costUsd.toFixed(9));
    },

    async reportByContact(range) {
      // Sums are cast to text or bigint so no float and no Decimal object is involved.
      const rows = await client.$queryRaw<ReportRow[]>`
        SELECT a."contactId" AS "contactId",
               c."displayName" AS "displayName",
               c."pictureUrl" AS "pictureUrl",
               COUNT(*)::bigint AS "replyCount",
               COUNT(*) FILTER (WHERE a."outcome" = 'ok')::bigint AS "okCount",
               SUM(a."inputTokens")::bigint AS "inputTokens",
               SUM(a."outputTokens")::bigint AS "outputTokens",
               SUM(a."cacheReadTokens")::bigint AS "cacheReadTokens",
               SUM(a."cacheWriteTokens")::bigint AS "cacheWriteTokens",
               SUM(a."costUsd")::text AS "cost"
        FROM "AiUsage" a
        LEFT JOIN "Contact" c ON c."id" = a."contactId"
        WHERE a."kind" = 'reply'
          AND a."createdAt" >= ${range.from}::timestamptz
          AND a."createdAt" < ${range.to}::timestamptz
        GROUP BY a."contactId", c."displayName", c."pictureUrl"
        ORDER BY SUM(a."costUsd") DESC, a."contactId" ASC NULLS LAST`;
      return rows.map((r): UsageByContactRow => ({
        contactId: r.contactId as ContactId | null, // brand: UUIDv7
        displayName: r.displayName,
        pictureUrl: r.pictureUrl,
        replyCount: Number(r.replyCount),
        okCount: Number(r.okCount),
        usage: {
          inputTokens: Number(r.inputTokens),
          outputTokens: Number(r.outputTokens),
          cacheReadTokens: Number(r.cacheReadTokens),
          cacheWriteTokens: Number(r.cacheWriteTokens),
        },
        cost: decimalStringToNano(r.cost),
      }));
    },

    ingestSummary: (range) => summaryOf('ingest', range),

    guardSummary: (range) => summaryOf('guard', range),

    async countSafetyOutcomes(range) {
      // One statement so both counts come from the same snapshot.
      const [row] = await client.$queryRaw<{ guardBlocked: number; outputRejected: number }[]>`
        SELECT
          (COUNT(*) FILTER (WHERE "kind" = 'guard' AND "outcome" = 'blocked'))::int AS "guardBlocked",
          (COUNT(*) FILTER (WHERE "error" IN ('ai.invalid_output', 'ai.refused')))::int
            AS "outputRejected"
        FROM "AiUsage"
        WHERE "createdAt" >= ${range.from}::timestamptz AND "createdAt" < ${range.to}::timestamptz`;
      if (!row) throw new Error('UsageRepository.countSafetyOutcomes: aggregate returned no row');
      return { guardBlocked: row.guardBlocked, outputRejected: row.outputRejected };
    },

    async countNoResponse(range) {
      return client.aiUsage.count({
        where: { error: 'ai.no_response', createdAt: { gte: range.from, lt: range.to } },
      });
    },

    async listForContact(contactId, range) {
      const rows = await client.aiUsage.findMany({
        where: { contactId, createdAt: { gte: range.from, lt: range.to } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return rows.map(toAiUsageRecord);
    },
  };
}
