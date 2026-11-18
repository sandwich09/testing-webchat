import { describe, expect, it } from 'vitest';
import { FakeSettingsRepository } from '@/adapters/fakes';
import { PRICE_TABLE } from '@/core/domain';
import { makeCheckHealth } from './check-health.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: null };

describe('CheckHealth', () => {
  it('returns database ok when ping succeeds', async () => {
    const check = makeCheckHealth({ settings: new FakeSettingsRepository() }, config);

    expect(await check({}, ctx)).toEqual({ ok: true, value: { database: 'ok' } });
  });

  it('returns db.unavailable when ping throws', async () => {
    const settings = new FakeSettingsRepository();
    settings.pingError = new Error('connection refused');

    const result = await makeCheckHealth({ settings }, config)({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('db.unavailable');
  });
});
