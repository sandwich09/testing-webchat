import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeIdGenerator,
  FakeMessageRepository,
  FakeSettingsRepository,
  FakeUsageRepository,
} from '@/adapters/fakes';
import type { AiUsageRecord, EventCode, NanoUsd } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeGetGuardrailStats } from './get-guardrail-stats.use-case';
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
const ZERO = {
  aiEnabled: false,
  guardEnabled: false,
  guardBlocked: 0,
  outputRejected: 0,
  handoffs: { notInKnowledge: 0, needsHuman: 0, failedOrTimeout: 0, other: 0 },
  budgetReached: 0,
  nonText: 0,
};

describe('GetGuardrailStats', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let settings: FakeSettingsRepository;
  let usage: FakeUsageRepository;
  let messages: FakeMessageRepository;
  let run: ReturnType<typeof makeGetGuardrailStats>;

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
      cost: 1n as NanoUsd, // brand: test amount
      outcome: 'ok',
      error: null,
      createdAt: clock.now(),
      ...over,
    });

  const addEvent = async (eventCode: EventCode, createdAt: Date = clock.now()) => {
    await messages.insertEvent({
      id: ids.messageId(),
      contactId: ids.contactId(),
      direction: 'internal',
      author: 'system',
      type: 'event',
      text: null,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode,
      lineMessageId: null,
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt,
      sentAt: null,
    });
  };

  beforeEach(() => {
    // 00:01 Bangkok on 2026-11-18, which is still 17:01 UTC on the 17th.
    clock = new FakeClock(new Date('2026-11-17T17:01:00.000Z'));
    ids = new FakeIdGenerator(clock);
    settings = new FakeSettingsRepository();
    usage = new FakeUsageRepository();
    messages = new FakeMessageRepository();
    run = makeGetGuardrailStats({ settings, usage, messages, clock }, config);
  });

  it('returns zero everywhere when there is no data', async () => {
    const result = await run({}, ctx);

    expect(result.ok ? result.value : null).toEqual(ZERO);
  });

  it('leaves out rows of yesterday in Bangkok time', async () => {
    const yesterday = new Date('2026-11-17T16:59:00.000Z');
    await addUsage({ kind: 'guard', outcome: 'blocked', createdAt: yesterday });
    await addUsage({ error: 'ai.refused', createdAt: yesterday });
    await addEvent('handoff.ai_failed', yesterday);
    await addEvent('handoff.budget_reached', yesterday);

    const result = await run({}, ctx);

    expect(result.ok ? result.value : null).toEqual(ZERO);
  });

  it('adds ai_failed and ai_timeout into failedOrTimeout', async () => {
    await addEvent('handoff.ai_failed');
    await addEvent('handoff.ai_timeout');

    const result = await run({}, ctx);

    expect(result.ok ? result.value.handoffs.failedOrTimeout : null).toBe(2);
  });

  it('groups the other handoff reasons as the doc says', async () => {
    await addEvent('handoff.ai_not_in_knowledge');
    await addEvent('handoff.ai_needs_human_action');
    await addEvent('handoff.ai_needs_human_action');
    await addEvent('handoff.ai_unsafe_or_offtopic');
    await addEvent('handoff.ai_other');
    await addEvent('handoff.budget_reached');
    await addEvent('handoff.customer_sent_image');
    await addEvent('handoff.customer_sent_video');
    await addEvent('handoff.customer_sent_non_text');
    await addEvent('guard.blocked');

    const result = await run({}, ctx);

    expect(result.ok ? result.value : null).toEqual({
      ...ZERO,
      handoffs: { notInKnowledge: 1, needsHuman: 2, failedOrTimeout: 0, other: 2 },
      budgetReached: 1,
      nonText: 3,
    });
  });

  it('counts ai.refused of kind reply and ai.invalid_output of kind guard as outputRejected', async () => {
    await addUsage({ kind: 'reply', outcome: 'failed', error: 'ai.refused' });
    await addUsage({ kind: 'guard', outcome: 'failed', error: 'ai.invalid_output' });
    await addUsage({ kind: 'reply', outcome: 'failed', error: 'ai.unavailable' });

    const result = await run({}, ctx);

    expect(result.ok ? result.value.outputRejected : null).toBe(2);
  });

  it('does not count a kind reply outcome blocked in guardBlocked', async () => {
    await addUsage({ kind: 'reply', outcome: 'blocked' });
    await addUsage({ kind: 'guard', outcome: 'blocked' });

    const result = await run({}, ctx);

    expect(result.ok ? result.value.guardBlocked : null).toBe(1);
  });

  it('returns aiEnabled and guardEnabled from Settings', async () => {
    await settings.update({ aiEnabled: true, guardEnabled: true, guardTopics: ['a'] });

    const result = await run({}, ctx);

    expect(result.ok ? [result.value.aiEnabled, result.value.guardEnabled] : null).toEqual([
      true,
      true,
    ]);
  });
});
