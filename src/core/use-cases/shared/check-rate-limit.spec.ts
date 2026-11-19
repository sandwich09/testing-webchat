import { beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT_RULES, effectiveLimit } from '@/core/domain';
import type { RateLimitRepository } from '@/core/ports';
import { FakeContentHasher, FakeRateLimitRepository } from '@/adapters/fakes';
import { makeCheckRateLimit } from './check-rate-limit';
import { makeHitRateLimit } from './hit-rate-limit';

/** Records every key passed to the repository. */
class RecordingRateLimits implements RateLimitRepository {
  readonly keys: string[] = [];
  private readonly inner = new FakeRateLimitRepository();

  readonly hit: RateLimitRepository['hit'] = (key, windowStart) => {
    this.keys.push(key);
    return this.inner.hit(key, windowStart);
  };

  readonly peek: RateLimitRepository['peek'] = (key, windowStart) => {
    this.keys.push(key);
    return this.inner.peek(key, windowStart);
  };
}

const IP = '203.0.113.7';
// 10 s into a one-minute window.
const T0 = new Date('2026-11-18T03:00:10.000Z');

describe('checkRateLimit', () => {
  let rateLimits: RecordingRateLimits;
  let hasher: FakeContentHasher;

  beforeEach(() => {
    rateLimits = new RecordingRateLimits();
    hasher = new FakeContentHasher();
  });

  const hitter = (scale = 1) => makeHitRateLimit({ rateLimits, hasher }, { rateLimitScale: scale });
  const checker = (scale = 1) =>
    makeCheckRateLimit({ rateLimits, hasher }, { rateLimitScale: scale });

  describe('checkRateLimit', () => {
    it('reads the bucket hitRateLimit writes without counting', async () => {
      const hit = hitter();
      const check = checker();
      const limit = RATE_LIMIT_RULES.unlock.limit;

      for (let i = 0; i < limit - 1; i += 1) await hit('unlock', IP, T0);
      expect(await check('unlock', IP, T0)).toEqual({ limited: false });
      expect(await check('unlock', IP, T0)).toEqual({ limited: false });

      await hit('unlock', IP, T0);
      expect(await check('unlock', IP, T0)).toEqual({ limited: true, retryAfterSeconds: 50 });
      expect(new Set(rateLimits.keys)).toEqual(new Set([`unlock:${hasher.keyedHash(IP)}`]));
    });

    it('is not limited in a new window', async () => {
      const hit = hitter();
      for (let i = 0; i < RATE_LIMIT_RULES.unlock.limit; i += 1) await hit('unlock', IP, T0);

      const next = new Date(T0.getTime() + RATE_LIMIT_RULES.unlock.windowMs);
      expect(await checker()('unlock', IP, next)).toEqual({ limited: false });
    });

    it('applies RATE_LIMIT_SCALE through effectiveLimit', async () => {
      const hit = hitter(2);
      const check = checker(2);
      const limit = effectiveLimit('send_message', 2);
      for (let i = 0; i < limit - 1; i += 1) await hit('send_message', IP, T0);
      expect(await check('send_message', IP, T0)).toEqual({ limited: false });

      await hit('send_message', IP, T0);
      expect(await check('send_message', IP, T0)).toMatchObject({ limited: true });
    });
  });
});
