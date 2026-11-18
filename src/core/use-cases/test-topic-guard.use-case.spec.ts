import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_GUARD_USAGE,
  FakeClock,
  FakeContentHasher,
  FakeIdGenerator,
  FakeLogger,
  FakeRateLimitRepository,
  FakeSettingsRepository,
  FakeTopicGuard,
  FakeUsageRepository,
} from '@/adapters/fakes';
import type { NanoUsd } from '@/core/domain';
import {
  GUARD_MAX_TOKENS,
  GUARD_MODEL,
  GUARD_TIMEOUT_MS,
  PRICE_TABLE,
  RATE_LIMIT_GUARD_TEST,
  computeCost,
} from '@/core/domain';
import { makeTestTopicGuard } from './test-topic-guard.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const baseConfig: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx: RequestContext = { requestId: 'req-1', clientIp: '203.0.113.7' };
const TEXT = 'ขอมุกตลกหน่อย';
const TOPICS = ['มุกตลก', 'ดูดวง'];

describe('TestTopicGuard', () => {
  let clock: FakeClock;
  let settings: FakeSettingsRepository;
  let usage: FakeUsageRepository;
  let guard: FakeTopicGuard;
  let logger: FakeLogger;
  let ids: FakeIdGenerator;

  const build = (config: UseCaseConfig = baseConfig) =>
    makeTestTopicGuard(
      {
        rateLimits: new FakeRateLimitRepository(),
        hasher: new FakeContentHasher(),
        settings,
        usage,
        topicGuard: guard,
        ids,
        clock,
        logger,
      },
      config,
    );
  let run: ReturnType<typeof build>;
  const code = (r: Awaited<ReturnType<typeof run>>) => (r.ok ? null : r.error.code);

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    settings = new FakeSettingsRepository();
    usage = new FakeUsageRepository();
    guard = new FakeTopicGuard();
    logger = new FakeLogger(clock);
    await settings.update({ aiEnabled: true, guardTopics: TOPICS });
    run = build();
  });

  it('returns ai.disabled_globally without calling the guard when the kill switch is off', async () => {
    await settings.update({ aiEnabled: false });

    expect(code(await run({ text: TEXT }, ctx))).toBe('ai.disabled_globally');
    expect(guard.requests).toEqual([]);
  });

  it('returns settings.guard_topics_required when no topic is saved', async () => {
    await settings.update({ guardTopics: [] });

    expect(code(await run({ text: TEXT }, ctx))).toBe('settings.guard_topics_required');
    expect(guard.requests).toEqual([]);
  });

  it('returns ai.budget_exhausted without calling the guard when today is at the budget', async () => {
    const budget = (await settings.get()).aiDailyBudget;
    await usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId: null,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: GUARD_MODEL,
      usage: FAKE_GUARD_USAGE,
      cost: budget,
      outcome: 'ok',
      error: null,
      createdAt: clock.now(),
    });

    expect(code(await run({ text: TEXT }, ctx))).toBe('ai.budget_exhausted');
    expect(guard.requests).toEqual([]);
  });

  it('tries the guard even when guardEnabled is false', async () => {
    guard.enqueueAllowed('มุกตลก');

    const result = await run({ text: TEXT }, ctx);

    expect((await settings.get()).guardEnabled).toBe(false);
    expect(result.ok).toBe(true);
    expect(guard.requests).toHaveLength(1);
  });

  it('returns allowed with the matched topic and records AiUsage kind guard outcome ok', async () => {
    guard.enqueueAllowed('มุกตลก');

    const result = await run({ text: TEXT }, ctx);

    expect(result.ok ? result.value.allowed : null).toBe(true);
    expect(result.ok ? result.value.matchedTopic : null).toBe('มุกตลก');
    expect(usage.records).toEqual([
      expect.objectContaining({
        kind: 'guard',
        outcome: 'ok',
        contactId: null,
        messageId: null,
        documentId: null,
        error: null,
        usage: FAKE_GUARD_USAGE,
      }),
    ]);
    expect(logger.eventsOf()).toEqual(['guard.checked']);
  });

  it('returns allowed false and records outcome blocked when the text is outside the topics', async () => {
    guard.enqueueBlocked();

    const result = await run({ text: TEXT }, ctx);

    expect(result.ok ? result.value : null).toEqual(
      expect.objectContaining({ allowed: false, matchedTopic: null }),
    );
    expect(usage.records.map((r) => r.outcome)).toEqual(['blocked']);
    // A blocked verdict is a normal answer, not an AI error.
    expect((await settings.get()).lastAiError).toBeNull();
  });

  it('returns a null matchedTopic when the model names a topic that is not saved', async () => {
    guard.enqueueAllowed('ไม่มีในรายการ');

    const result = await run({ text: TEXT }, ctx);

    expect(result.ok ? result.value.allowed : null).toBe(true);
    expect(result.ok ? result.value.matchedTopic : 'x').toBeNull();
  });

  it('asks the guard with GUARD_MODEL, the saved topics, the text and an empty context', async () => {
    await run({ text: TEXT }, ctx);

    expect(guard.requests).toEqual([
      {
        topics: TOPICS,
        message: TEXT,
        context: [],
        model: GUARD_MODEL,
        maxTokens: GUARD_MAX_TOKENS,
        timeoutMs: GUARD_TIMEOUT_MS,
      },
    ]);
  });

  it.each(['ai.unavailable', 'ai.rate_limited', 'ai.auth_failed', 'ai.bad_request'] as const)(
    'returns %s from the port, records the AI error and writes no AiUsage',
    async (errorCode) => {
      guard.enqueueError(errorCode);

      const result = await run({ text: TEXT }, ctx);

      expect(code(result)).toBe(errorCode);
      expect(usage.records).toEqual([]);
      expect((await settings.get()).lastAiError).toEqual({ code: errorCode, at: clock.now() });
      expect(logger.eventsOf()).toEqual(['guard.failed']);
    },
  );

  it.each([
    ['refused', 'ai.refused', (g: FakeTopicGuard) => g.enqueueRefusal()],
    ['truncated', 'ai.truncated', (g: FakeTopicGuard) => g.enqueueTruncated()],
    ['off-schema', 'ai.invalid_output', (g: FakeTopicGuard) => g.enqueueInvalidOutput()],
  ] as const)(
    'returns %s answers as %s, records the AI error and AiUsage outcome failed',
    async (_, errorCode, script) => {
      script(guard);

      const result = await run({ text: TEXT }, ctx);

      expect(code(result)).toBe(errorCode);
      expect(usage.records).toEqual([
        expect.objectContaining({ kind: 'guard', outcome: 'failed', error: errorCode }),
      ]);
      expect((await settings.get()).lastAiError).toEqual({ code: errorCode, at: clock.now() });
      expect(logger.eventsOf()).toEqual(['guard.failed']);
    },
  );

  it('limits to RATE_LIMIT_GUARD_TEST checks per window from one IP', async () => {
    for (let i = 0; i < RATE_LIMIT_GUARD_TEST.limit; i += 1) {
      expect((await run({ text: TEXT }, ctx)).ok).toBe(true);
    }

    const result = await run({ text: TEXT }, ctx);

    expect(code(result)).toBe('settings.guard_rate_limited');
    expect(result.ok ? null : result.error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(guard.requests).toHaveLength(RATE_LIMIT_GUARD_TEST.limit);
  });

  it('multiplies the limit by RATE_LIMIT_SCALE', async () => {
    run = build({ ...baseConfig, rateLimitScale: 10 });
    const limit = RATE_LIMIT_GUARD_TEST.limit * 10;
    for (let i = 0; i < limit; i += 1) expect((await run({ text: TEXT }, ctx)).ok).toBe(true);

    expect(code(await run({ text: TEXT }, ctx))).toBe('settings.guard_rate_limited');
  });

  it('returns a cost equal to the cost of its AiUsage row', async () => {
    guard.enqueueAllowed('มุกตลก');

    const result = await run({ text: TEXT }, ctx);

    const row = usage.records[0];
    expect(row).toBeDefined();
    const expected: NanoUsd = computeCost(FAKE_GUARD_USAGE, GUARD_MODEL, PRICE_TABLE).cost;
    expect(result.ok ? result.value.cost : null).toBe(row?.cost);
    expect(row?.cost).toBe(expected);
    expect(row?.cost).toBeGreaterThan(0n);
  });

  it('keeps the text and the topics out of the log', async () => {
    guard.enqueueAllowed('มุกตลก');

    await run({ text: TEXT }, ctx);

    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain(TEXT);
    expect(dump).not.toContain('มุกตลก');
  });
});
