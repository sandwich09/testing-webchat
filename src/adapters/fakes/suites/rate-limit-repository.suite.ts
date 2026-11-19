import { beforeEach, describe, expect, it } from 'vitest';
import type { RateLimitRepository } from '@/core/ports';

const KEY = 'send_message:3f2a9c';
const OTHER = 'unlock:3f2a9c';
const w0 = new Date('2026-11-18T03:00:00.000Z');
const w1 = new Date('2026-11-18T03:01:00.000Z');

/**
 * Runs the RateLimitRepository contract (docs/architecture/domain-and-ports.md, data-model.md
 * rule 11) against the subject. `makeSubject` runs before every test and must return a
 * repository over an empty RateLimitBucket table.
 */
export const describeRateLimitRepositorySuite = (
  makeSubject: () => RateLimitRepository | Promise<RateLimitRepository>,
): void => {
  describe('RateLimitRepository contract', () => {
    let repo: RateLimitRepository;

    beforeEach(async () => {
      repo = await makeSubject();
    });

    it('hit counts up within a window and per key', async () => {
      expect(await repo.hit(KEY, w0)).toEqual({ count: 1 });
      expect(await repo.hit(KEY, w0)).toEqual({ count: 2 });
      expect(await repo.hit(KEY, w0)).toEqual({ count: 3 });
      expect(await repo.hit(OTHER, w0)).toEqual({ count: 1 });
    });

    it('hit restarts at 1 in a newer window', async () => {
      await repo.hit(KEY, w0);
      await repo.hit(KEY, w0);
      expect(await repo.hit(KEY, w1)).toEqual({ count: 1 });
    });

    it('a late hit with an older window counts on and keeps the newer window', async () => {
      await repo.hit(KEY, w1);
      expect(await repo.hit(KEY, w0)).toEqual({ count: 2 });
      expect(await repo.hit(KEY, w1)).toEqual({ count: 3 });
    });

    it('concurrent hits each get a distinct count, so only `limit` of them stay within it', async () => {
      const results = await Promise.all(Array.from({ length: 50 }, () => repo.hit(KEY, w0)));
      const counts = results.map((r) => r.count).sort((a, b) => a - b);
      expect(counts).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(counts.filter((c) => c <= 5)).toHaveLength(5);
    });

    it('refund takes back one hit of the same window', async () => {
      await repo.hit(KEY, w0);
      await repo.hit(KEY, w0);
      await repo.refund(KEY, w0);
      expect(await repo.hit(KEY, w0)).toEqual({ count: 2 });
    });

    it('refund never goes below 0 and ignores a missing row or another window', async () => {
      await repo.refund(KEY, w0);
      expect(await repo.hit(KEY, w0)).toEqual({ count: 1 });
      await repo.refund(KEY, w0);
      await repo.refund(KEY, w0);
      expect(await repo.hit(KEY, w0)).toEqual({ count: 1 });
      await repo.refund(KEY, w1);
      expect(await repo.hit(KEY, w0)).toEqual({ count: 2 });
      await repo.hit(KEY, w1);
      await repo.refund(KEY, w0);
      expect(await repo.hit(KEY, w1)).toEqual({ count: 2 });
    });

    it('concurrent hits and refunds leave the exact count', async () => {
      await Promise.all(Array.from({ length: 20 }, () => repo.hit(KEY, w0)));
      await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          i % 3 === 0 ? repo.refund(KEY, w0) : repo.hit(KEY, w0),
        ),
      );
      // 20 + 20 hits - 10 refunds.
      expect(await repo.hit(KEY, w0)).toEqual({ count: 31 });
    });
  });
};
