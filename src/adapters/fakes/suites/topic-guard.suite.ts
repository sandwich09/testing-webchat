import { describe, expect, it } from 'vitest';
import { GUARD_MAX_TOKENS, GUARD_MODEL, GUARD_TIMEOUT_MS } from '@/core/domain';
import type { TopicGuard, TopicGuardRequest, TopicVerdict } from '@/core/ports';

export type TopicGuardErrorCode =
  'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

/** What the provider should answer to the next `classify` call. */
export type TopicGuardScenario =
  /** A completed answer whose JSON matches the schema of ai-prompt 9.3. */
  | { kind: 'verdict'; verdict: TopicVerdict }
  /** The answer is complete but its JSON does not match the schema. */
  | { kind: 'invalid_output' }
  | { kind: 'refused' }
  | { kind: 'truncated' }
  /** The provider gives no answer at all. */
  | { kind: 'error'; code: TopicGuardErrorCode };

/**
 * `arrange` sets up the next answer: the fake queues it, the real adapter tells the Anthropic stub
 * (stubs-and-fixtures section 5, kind `guard`). It applies to the next call only.
 *
 * The timeout and retry row of the TopicGuard table (timeoutMs per request, at most
 * CLAUDE_GUARD_MAX_RETRIES retries, no stream, no tools) depends on the transport, so the adapter
 * spec checks it against the stub; this suite does not.
 */
export interface TopicGuardHarness {
  topicGuard: TopicGuard;
  arrange(scenario: TopicGuardScenario): Promise<void>;
}

const TOPICS = ['มุกตลกไทย', 'มุกจากภาพยนตร์'];

const request = (): TopicGuardRequest => ({
  topics: [...TOPICS],
  message: 'ขออีกมุก',
  context: [
    { role: 'customer', text: 'เล่ามุกตลกหน่อย' },
    { role: 'shop', text: 'มุกแรกค่ะ' },
  ],
  model: GUARD_MODEL,
  maxTokens: GUARD_MAX_TOKENS,
  timeoutMs: GUARD_TIMEOUT_MS,
});

const expectUsage = (usage: unknown): void => {
  expect(usage).toEqual({
    inputTokens: expect.any(Number) as number,
    outputTokens: expect.any(Number) as number,
    cacheReadTokens: expect.any(Number) as number,
    cacheWriteTokens: expect.any(Number) as number,
  });
};

/** Runs the rows of the TopicGuard table in domain-and-ports against the subject. */
export const describeTopicGuardSuite = (
  makeHarness: () => TopicGuardHarness | Promise<TopicGuardHarness>,
): void => {
  describe('TopicGuard.classify', () => {
    it('returns ok with the verdict, usage and served model for an allowed answer', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'verdict', verdict: { allowed: true, matchedTopic: 'มุกตลกไทย' } });
      const result = await h.topicGuard.classify(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('completed');
      // Exactly the two fields of the schema, nothing else.
      expect(result.value.verdict).toStrictEqual({ allowed: true, matchedTopic: 'มุกตลกไทย' });
      expectUsage(result.value.usage);
      expect(result.value.servedModel.length).toBeGreaterThan(0);
    });

    it('returns ok with the verdict for a blocked answer', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'verdict', verdict: { allowed: false, matchedTopic: null } });
      const result = await h.topicGuard.classify(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('completed');
      expect(result.value.verdict).toStrictEqual({ allowed: false, matchedTopic: null });
      expectUsage(result.value.usage);
    });

    it('passes on a matched topic that is not in the list; the core compares it', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'verdict', verdict: { allowed: true, matchedTopic: 'เรื่องอื่น' } });
      const result = await h.topicGuard.classify(request());
      expect(result.ok && result.value.verdict).toStrictEqual({
        allowed: true,
        matchedTopic: 'เรื่องอื่น',
      });
    });

    it('returns verdict null with stop completed when the answer does not match the schema', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'invalid_output' });
      const result = await h.topicGuard.classify(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('completed');
      expect(result.value.verdict).toBeNull();
      expectUsage(result.value.usage);
    });

    it('returns ok with usage and no verdict for a refusal', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'refused' });
      const result = await h.topicGuard.classify(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('refused');
      expect(result.value.verdict).toBeNull();
      expectUsage(result.value.usage);
    });

    it('returns ok with usage and no verdict for a truncated answer', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'truncated' });
      const result = await h.topicGuard.classify(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('truncated');
      expect(result.value.verdict).toBeNull();
      expectUsage(result.value.usage);
    });

    it.each<TopicGuardErrorCode>([
      'ai.unavailable',
      'ai.rate_limited',
      'ai.auth_failed',
      'ai.bad_request',
    ])('returns %s only when the provider gave no answer', async (code) => {
      const h = await makeHarness();
      await h.arrange({ kind: 'error', code });
      const result = await h.topicGuard.classify(request());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    });
  });
};
