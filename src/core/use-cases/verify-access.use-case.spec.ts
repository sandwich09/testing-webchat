import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAccessTokenSigner, FakeClock } from '@/adapters/fakes';
import { ACCESS_COOKIE_TTL_MS, PRICE_TABLE } from '@/core/domain';
import { makeVerifyAccess } from './verify-access.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx: RequestContext = { requestId: 'req-1', clientIp: '203.0.113.7' };

describe('VerifyAccess', () => {
  let clock: FakeClock;
  let signer: FakeAccessTokenSigner;
  let verify: ReturnType<typeof makeVerifyAccess>;

  beforeEach(() => {
    clock = new FakeClock();
    signer = new FakeAccessTokenSigner();
    verify = makeVerifyAccess({ signer, clock }, config);
  });

  it('returns access.unauthorized when there is no token', async () => {
    const result = await verify({ token: null }, ctx);

    expect(result.ok ? null : result.error.code).toBe('access.unauthorized');
  });

  it('accepts a valid token that has not expired', async () => {
    const { token } = signer.issue(clock.now());

    expect(await verify({ token }, ctx)).toEqual({ ok: true, value: undefined });
  });

  it('rejects the token once ACCESS_COOKIE_TTL_MS has passed', async () => {
    const { token } = signer.issue(clock.now());
    clock.advance(ACCESS_COOKIE_TTL_MS);

    const result = await verify({ token }, ctx);

    expect(result.ok ? null : result.error.code).toBe('access.unauthorized');
  });

  it('rejects a token with one character changed', async () => {
    const { token } = signer.issue(clock.now());
    const last = token.at(-1);
    const tampered = token.slice(0, -1) + (last === 'A' ? 'B' : 'A');

    const result = await verify({ token: tampered }, ctx);

    expect(result.ok ? null : result.error.code).toBe('access.unauthorized');
  });
});
