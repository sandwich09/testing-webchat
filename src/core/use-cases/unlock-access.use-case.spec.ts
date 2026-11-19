import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_ACCESS_CODE,
  FakeAccessTokenSigner,
  FakeClock,
  FakeContentHasher,
  FakeLogger,
  FakeRateLimitRepository,
} from '@/adapters/fakes';
import {
  ACCESS_COOKIE_TTL_MS,
  PRICE_TABLE,
  RATE_LIMIT_UNLOCK,
  RATE_LIMIT_UNLOCK_NO_IP,
} from '@/core/domain';
import type { RateLimitRepository } from '@/core/ports';
import { NO_CLIENT_IP_SUBJECT, makeUnlockAccess } from './unlock-access.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const baseConfig: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ipCtx = (clientIp: string | null): RequestContext => ({ requestId: 'req-1', clientIp });
const IP = '203.0.113.7';

describe('UnlockAccess', () => {
  let clock: FakeClock;
  let logger: FakeLogger;
  let rateLimits: FakeRateLimitRepository;
  let keys: string[];

  const build = (config: UseCaseConfig = baseConfig) => {
    const recording: RateLimitRepository = {
      hit: (key, windowStart) => {
        keys.push(key);
        return rateLimits.hit(key, windowStart);
      },
      refund: (key, windowStart) => {
        keys.push(key);
        return rateLimits.refund(key, windowStart);
      },
    };
    return makeUnlockAccess(
      {
        rateLimits: recording,
        hasher: new FakeContentHasher(),
        signer: new FakeAccessTokenSigner(),
        clock,
        logger,
      },
      config,
    );
  };
  const failTimes = async (
    unlock: ReturnType<typeof build>,
    n: number,
    ip: string | null = IP,
  ): Promise<void> => {
    for (let i = 0; i < n; i += 1) await unlock({ code: 'wrong' }, ipCtx(ip));
  };
  const code = (r: Awaited<ReturnType<ReturnType<typeof build>>>) => (r.ok ? null : r.error.code);

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    logger = new FakeLogger(clock);
    rateLimits = new FakeRateLimitRepository();
    keys = [];
  });

  it('issues a token that expires after ACCESS_COOKIE_TTL_MS on the right code', async () => {
    const result = await build()({ code: FAKE_ACCESS_CODE }, ipCtx(IP));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expiresAt.getTime()).toBe(clock.now().getTime() + ACCESS_COOKIE_TTL_MS);
    expect(result.value.token).not.toBe('');
    expect(logger.eventsOf()).toEqual(['access.unlock.succeeded']);
  });

  it('returns access.code_invalid on a wrong code and logs without the code', async () => {
    const result = await build()({ code: 'typed-by-user' }, ipCtx(IP));

    expect(code(result)).toBe('access.code_invalid');
    expect(logger.eventsOf()).toEqual(['access.unlock.failed']);
    expect(JSON.stringify(logger.entries)).not.toContain('typed-by-user');
  });

  it('rejects even the right code after RATE_LIMIT_UNLOCK wrong attempts, with retryAfterSeconds', async () => {
    const unlock = build();
    await failTimes(unlock, RATE_LIMIT_UNLOCK.limit);

    const result = await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(IP));

    expect(code(result)).toBe('access.rate_limited');
    if (result.ok) return;
    expect(result.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(logger.eventsOf()).toContain('access.unlock.rate_limited');
  });

  it('does not count right codes: more than RATE_LIMIT_UNLOCK of them all get a token', async () => {
    const unlock = build();

    for (let i = 0; i < RATE_LIMIT_UNLOCK.limit + 3; i += 1) {
      const result = await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(IP));
      expect(result.ok).toBe(true);
    }
  });

  it('lets the next attempt through after the window has passed', async () => {
    const unlock = build();
    await failTimes(unlock, RATE_LIMIT_UNLOCK.limit);
    clock.advance(RATE_LIMIT_UNLOCK.windowMs);

    const result = await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(IP));

    expect(result.ok).toBe(true);
  });

  it('does not scale the unlock limit with RATE_LIMIT_SCALE', async () => {
    const unlock = build({ ...baseConfig, rateLimitScale: 10 });
    await failTimes(unlock, RATE_LIMIT_UNLOCK.limit);

    const result = await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(IP));

    expect(code(result)).toBe('access.rate_limited');
  });

  it('counts two IPs separately', async () => {
    const unlock = build();
    await failTimes(unlock, RATE_LIMIT_UNLOCK.limit, '203.0.113.1');

    const other = await unlock({ code: FAKE_ACCESS_CODE }, ipCtx('203.0.113.2'));

    expect(other.ok).toBe(true);
  });

  it('counts requests without an IP in one unlock_no_ip bucket of RATE_LIMIT_UNLOCK_NO_IP', async () => {
    const unlock = build();
    await failTimes(unlock, RATE_LIMIT_UNLOCK_NO_IP.limit, null);

    const result = await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(null));

    expect(code(result)).toBe('access.rate_limited');
    if (result.ok) return;
    expect(result.error.retryAfterSeconds).toBeGreaterThan(RATE_LIMIT_UNLOCK.windowMs / 1000);
    expect(keys.every((k) => k.startsWith('unlock_no_ip:'))).toBe(true);
    expect(logger.eventsOf('warn')).toContain('access.unlock.client_ip_missing');
  });

  it('keeps callers with an IP unaffected when the bucket without an IP is full', async () => {
    const unlock = build();
    await failTimes(unlock, RATE_LIMIT_UNLOCK_NO_IP.limit, null);

    expect((await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(IP))).ok).toBe(true);
    expect((await unlock({ code: 'wrong' }, ipCtx(IP))).ok).toBe(false);
    expect(code(await unlock({ code: 'wrong' }, ipCtx(IP)))).toBe('access.code_invalid');
  });

  it('does not let an IP whose text is the shared subject reach the bucket without an IP', async () => {
    const unlock = build();
    await failTimes(unlock, RATE_LIMIT_UNLOCK_NO_IP.limit, null);

    expect((await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(NO_CLIENT_IP_SUBJECT))).ok).toBe(true);
  });

  it('does not scale the bucket without an IP with RATE_LIMIT_SCALE', async () => {
    const unlock = build({ ...baseConfig, rateLimitScale: 10 });
    await failTimes(unlock, RATE_LIMIT_UNLOCK_NO_IP.limit, null);

    expect(code(await unlock({ code: FAKE_ACCESS_CODE }, ipCtx(null)))).toBe('access.rate_limited');
  });

  it('logs client_ip_missing only for requests without an IP', async () => {
    await build()({ code: FAKE_ACCESS_CODE }, ipCtx(IP));

    expect(logger.eventsOf()).toEqual(['access.unlock.succeeded']);
  });

  it('sends the repository a key without the raw IP', async () => {
    await build()({ code: 'wrong' }, ipCtx(IP));

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.startsWith('unlock:')).toBe(true);
      expect(key).not.toContain(IP);
    }
  });

  describe('under concurrency', () => {
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
    /** A repository whose every call yields first, so concurrent requests interleave. */
    const delayed = (): RateLimitRepository => ({
      hit: async (key, windowStart) => {
        await tick();
        return rateLimits.hit(key, windowStart);
      },
      refund: async (key, windowStart) => {
        await tick();
        return rateLimits.refund(key, windowStart);
      },
    });
    const buildCounting = () => {
      const signer = new FakeAccessTokenSigner();
      let checks = 0;
      const checkCode = signer.checkCode.bind(signer);
      signer.checkCode = (c: string) => {
        checks += 1;
        return checkCode(c);
      };
      const unlock = makeUnlockAccess(
        { rateLimits: delayed(), hasher: new FakeContentHasher(), signer, clock, logger },
        baseConfig,
      );
      return { unlock, checks: () => checks };
    };

    it.each([
      ['with an IP', IP, RATE_LIMIT_UNLOCK.limit],
      ['without an IP', null, RATE_LIMIT_UNLOCK_NO_IP.limit],
    ] as const)(
      'compares at most the limit of 200 concurrent wrong codes %s',
      async (_label, ip, limit) => {
        const { unlock, checks } = buildCounting();

        const results = await Promise.all(
          Array.from({ length: 200 }, (_, i) => unlock({ code: `guess-${String(i)}` }, ipCtx(ip))),
        );

        expect(checks()).toBe(limit);
        expect(results.filter((r) => code(r) === 'access.code_invalid')).toHaveLength(limit);
        expect(results.filter((r) => code(r) === 'access.rate_limited')).toHaveLength(200 - limit);
      },
    );

    it('does not let concurrent right codes use up the allowance', async () => {
      const { unlock } = buildCounting();

      const rights = await Promise.all(
        Array.from({ length: RATE_LIMIT_UNLOCK.limit }, () =>
          unlock({ code: FAKE_ACCESS_CODE }, ipCtx(IP)),
        ),
      );
      expect(rights.every((r) => r.ok)).toBe(true);

      const wrongs = await Promise.all(
        Array.from({ length: RATE_LIMIT_UNLOCK.limit }, () => unlock({ code: 'wrong' }, ipCtx(IP))),
      );
      expect(wrongs.every((r) => code(r) === 'access.code_invalid')).toBe(true);
      expect(code(await unlock({ code: 'wrong' }, ipCtx(IP)))).toBe('access.rate_limited');
    });
  });
});
