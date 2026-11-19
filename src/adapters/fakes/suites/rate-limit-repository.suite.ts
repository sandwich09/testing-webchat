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
      expect(await repo.peek(KEY, w1)).toEqual({ count: 1 });
      expect(await repo.peek(KEY, w0)).toEqual({ count: 0 });
    });

    it('a late hit with an older window counts on and keeps the newer window', async () => {
      await repo.hit(KEY, w1);
      expect(await repo.hit(KEY, w0)).toEqual({ count: 2 });
      expect(await repo.peek(KEY, w1)).toEqual({ count: 2 });
    });

    it('concurrent hits each get a distinct count', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => repo.hit(KEY, w0)));
      expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(await repo.peek(KEY, w0)).toEqual({ count: 6 });
    });

    it('peek reads without adding', async () => {
      expect(await repo.peek(KEY, w0)).toEqual({ count: 0 });
      await repo.hit(KEY, w0);
      expect(await repo.peek(KEY, w0)).toEqual({ count: 1 });
      expect(await repo.peek(KEY, w0)).toEqual({ count: 1 });
      expect(await repo.hit(KEY, w0)).toEqual({ count: 2 });
    });

    it('peek gives 0 for a row from an older window', async () => {
      await repo.hit(KEY, w0);
      expect(await repo.peek(KEY, w1)).toEqual({ count: 0 });
      expect(await repo.hit(KEY, w1)).toEqual({ count: 1 });
    });
  });
};
