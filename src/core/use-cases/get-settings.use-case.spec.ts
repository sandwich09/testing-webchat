import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeIdGenerator,
  FakeSettingsRepository,
  FakeUsageRepository,
} from '@/adapters/fakes';
import type { AiUsageRecord, NanoUsd } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeGetSettings } from './get-settings.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 2500,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: null };
const nano = (n: bigint): NanoUsd => n as NanoUsd; // brand: test amount

describe('GetSettings', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let settings: FakeSettingsRepository;
  let usage: FakeUsageRepository;

  const build = (c: UseCaseConfig = config) => makeGetSettings({ settings, usage, clock }, c);
  const addUsage = (over: Partial<AiUsageRecord>) =>
    usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId: null,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: nano(1_000n),
      outcome: 'ok',
      error: null,
      createdAt: clock.now(),
      ...over,
    });

  beforeEach(() => {
    // 10:00 Bangkok on 2026-11-18, CI runs in UTC.
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    settings = new FakeSettingsRepository();
    usage = new FakeUsageRepository();
  });

  it('returns the defaults when there is no row', async () => {
    const result = await build()({}, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.value.settings;
    expect(s.aiEnabled).toBe(false);
    expect(s.guardEnabled).toBe(false);
    expect(s.guardTopics).toEqual([]);
    expect(result.value.todayCost).toBe(0n);
    expect(result.value.guardBlockedToday).toBe(0);
  });

  it.each(['https://app.example.com', 'https://app.example.com/', 'https://app.example.com//'])(
    'builds a webhookUrl without a double slash from %s',
    async (appBaseUrl) => {
      const result = await build({ ...config, appBaseUrl })({}, ctx);

      expect(result.ok ? result.value.webhookUrl : null).toBe(
        'https://app.example.com/api/line/webhook',
      );
    },
  );

  it('leaves out yesterday (Bangkok time) from todayCost', async () => {
    await addUsage({ cost: nano(5n), createdAt: new Date('2026-11-17T16:59:59.000Z') });
    await addUsage({ cost: nano(7n), createdAt: new Date('2026-11-17T17:00:00.000Z') });
    await addUsage({ cost: nano(11n), createdAt: new Date('2026-11-18T05:00:00.000Z') });

    const result = await build()({}, ctx);

    expect(result.ok ? result.value.todayCost : null).toBe(18n);
  });

  it('counts only guard rows with outcome blocked today in guardBlockedToday', async () => {
    await addUsage({ kind: 'guard', outcome: 'blocked' });
    await addUsage({ kind: 'guard', outcome: 'blocked' });
    await addUsage({ kind: 'guard', outcome: 'ok' });
    await addUsage({ kind: 'guard', outcome: 'failed', error: 'ai.refused' });
    await addUsage({ kind: 'reply', outcome: 'blocked' });
    await addUsage({
      kind: 'guard',
      outcome: 'blocked',
      createdAt: new Date('2026-11-17T16:00:00.000Z'),
    });

    const result = await build()({}, ctx);

    expect(result.ok ? result.value.guardBlockedToday : null).toBe(2);
  });

  it('returns pollIntervalMs from the config', async () => {
    const result = await build({ ...config, pollIntervalMs: 4321 })({}, ctx);

    expect(result.ok ? result.value.pollIntervalMs : null).toBe(4321);
  });
});
