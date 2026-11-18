import type { RateLimitRepository } from '@/core/ports';
import type { PrismaClient } from './prisma-client';

export function createRateLimitRepository(client: PrismaClient): RateLimitRepository {
  return {
    async hit(key, windowStart) {
      // One statement: increments in the same window, restarts at 1 in a newer window.
      const rows = await client.$queryRaw<{ count: number }[]>`
        INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
        VALUES (${key}, ${windowStart}::timestamptz, 1)
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE WHEN "RateLimitBucket"."windowStart" < EXCLUDED."windowStart" THEN 1
                         ELSE "RateLimitBucket"."count" + 1 END,
          "windowStart" = GREATEST("RateLimitBucket"."windowStart", EXCLUDED."windowStart")
        RETURNING "count"`;
      const count = rows[0]?.count;
      if (count === undefined) throw new Error('RateLimitRepository.hit: no row returned');
      // A new window started: drop windows older than one day, so the table does not grow with IPs.
      if (count === 1) {
        await client.$executeRaw`
          DELETE FROM "RateLimitBucket"
          WHERE "windowStart" < ${windowStart}::timestamptz - interval '1 day'`;
      }
      return { count };
    },

    async peek(key, windowStart) {
      const row = await client.rateLimitBucket.findFirst({
        where: { key, windowStart },
        select: { count: true },
      });
      return { count: row?.count ?? 0 };
    },
  };
}
