import { beforeEach, describe, expect, it } from 'vitest';
import { RATE_LIMIT_RULES, effectiveLimit } from '@/core/domain';
import type { RateLimitRepository } from '@/core/ports';
import { FakeContentHasher, FakeRateLimitRepository } from '@/adapters/fakes';
import { makeHitRateLimit, makeRefundRateLimit } from './hit-rate-limit';

/** Records every key passed to the repository. */
class RecordingRateLimits implements RateLimitRepository {
  readonly keys: string[] = [];
  private readonly inner = new FakeRateLimitRepository();

  readonly hit: RateLimitRepository['hit'] = (key, windowStart) => {
    this.keys.push(key);
    return this.inner.hit(key, windowStart);
  };

  readonly refund: RateLimitRepository['refund'] = (key, windowStart) => {
    this.keys.push(key);
    return this.inner.refund(key, windowStart);
  };
}

const IP = '203.0.113.7';
// 10 s into a one-minute window.
const T0 = new Date('2026-11-18T03:00:10.000Z');

describe('hitRateLimit', () => {
  let rateLimits: RecordingRateLimits;
  let hasher: FakeContentHasher;

  beforeEach(() => {
    rateLimits = new RecordingRateLimits();
    hasher = new FakeContentHasher();
  });

  const hitter = (scale = 1) => makeHitRateLimit({ rateLimits, hasher }, { rateLimitScale: scale });

  describe('hitRateLimit', () => {
    it('allows up to the limit and then reports retryAfterSeconds to the window end', async () => {
      const hit = hitter();
      const limit = RATE_LIMIT_RULES.unlock.limit;
      for (let i = 0; i < limit; i += 1) {
        expect(await hit('unlock', IP, T0)).toEqual({ limited: false });
      }

      expect(await hit('unlock', IP, T0)).toEqual({ limited: true, retryAfterSeconds: 50 });
    });

    it('starts counting again in the next window', async () => {
      const hit = hitter();
      for (let i = 0; i <= RATE_LIMIT_RULES.unlock.limit; i += 1) await hit('unlock', IP, T0);

      const next = new Date(T0.getTime() + RATE_LIMIT_RULES.unlock.windowMs);
      expect(await hit('unlock', IP, next)).toEqual({ limited: false });
    });

    it('uses a key of action and keyed hash, never the raw IP', async () => {
      await hitter()('send_message', IP, T0);

      expect(rateLimits.keys).toEqual([`send_message:${hasher.keyedHash(IP)}`]);
      expect(rateLimits.keys[0]).not.toContain(IP);
    });

    it('counts actions and subjects separately', async () => {
      const hit = hitter();
      for (let i = 0; i <= RATE_LIMIT_RULES.unlock.limit; i += 1) await hit('unlock', IP, T0);

      expect(await hit('unlock', 'unknown', T0)).toEqual({ limited: false });
      expect(await hit('send_message', IP, T0)).toEqual({ limited: false });
    });

    it('applies RATE_LIMIT_SCALE to scaled actions through effectiveLimit', async () => {
      const hit = hitter(3);
      const limit = effectiveLimit('typing', 3);
      expect(limit).toBe(RATE_LIMIT_RULES.typing.limit * 3);
      for (let i = 0; i < limit; i += 1) {
        expect(await hit('typing', 'contact-1', T0)).toEqual({ limited: false });
      }

      expect(await hit('typing', 'contact-1', T0)).toMatchObject({ limited: true });
    });

    it('does not scale unlock', async () => {
      const hit = hitter(100);
      for (let i = 0; i < RATE_LIMIT_RULES.unlock.limit; i += 1) await hit('unlock', IP, T0);

      expect(await hit('unlock', IP, T0)).toMatchObject({ limited: true });
    });
  });

  describe('refundRateLimit', () => {
    it('takes back one hit of the same key and window', async () => {
      const hit = hitter();
      const refund = makeRefundRateLimit({ rateLimits, hasher });
      const limit = RATE_LIMIT_RULES.unlock.limit;
      for (let i = 0; i < limit; i += 1) await hit('unlock', IP, T0);
      await refund('unlock', IP, T0);

      expect(await hit('unlock', IP, T0)).toEqual({ limited: false });
      expect(await hit('unlock', IP, T0)).toMatchObject({ limited: true });
      expect(rateLimits.keys.every((k) => k === `unlock:${hasher.keyedHash(IP)}`)).toBe(true);
    });
  });
});
