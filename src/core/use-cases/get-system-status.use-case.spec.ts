import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeIdGenerator,
  FakeSettingsRepository,
  FakeUsageRepository,
} from '@/adapters/fakes';
import type { NanoUsd } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeGetSystemStatus } from './get-system-status.use-case';
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

describe('GetSystemStatus', () => {
  let clock: FakeClock;
  let settings: FakeSettingsRepository;
  let usage: FakeUsageRepository;
  let ids: FakeIdGenerator;
  let run: ReturnType<typeof makeGetSystemStatus>;

  const addCost = (cost: bigint, createdAt: Date) =>
    usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId: null,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: cost as NanoUsd, // brand: test amount
      outcome: 'ok',
      error: null,
      createdAt,
    });

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    settings = new FakeSettingsRepository();
    usage = new FakeUsageRepository();
    run = makeGetSystemStatus({ settings, usage, clock }, config);
  });

  it('leaves out yesterday (Bangkok time) from todayCost', async () => {
    await addCost(100n, new Date('2026-11-17T16:59:00.000Z'));
    await addCost(7n, new Date('2026-11-17T17:01:00.000Z'));

    const result = await run({}, ctx);

    expect(result.ok ? result.value.todayCost : null).toBe(7n);
  });

  it('returns lastWebhookAt null when no webhook has arrived', async () => {
    const result = await run({}, ctx);

    expect(result.ok ? result.value.lastWebhookAt : 'x').toBeNull();
    expect(result.ok ? result.value.lastLineError : 'x').toBeNull();
    expect(result.ok ? result.value.lastAiError : 'x').toBeNull();
  });

  it('returns the settings values, the budget and the price table date', async () => {
    const at = new Date('2026-11-18T02:00:00.000Z');
    await settings.recordWebhookReceived(at);
    await settings.recordLineError({ code: 'line.unavailable', at });
    await settings.recordAiError({ code: 'ai.unavailable', at });

    const result = await run({}, ctx);

    expect(result.ok ? result.value : null).toEqual({
      lastWebhookAt: at,
      lastLineError: { code: 'line.unavailable', at },
      lastAiError: { code: 'ai.unavailable', at },
      todayCost: 0n,
      dailyBudget: (await settings.get()).aiDailyBudget,
      priceTableDate: PRICE_TABLE.asOf,
      database: 'ok',
    });
  });
});
