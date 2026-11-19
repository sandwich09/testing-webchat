import { describe, expect, it } from 'vitest';
import type { ModelHandoffReason } from '@/core/domain';
import type { ChatModel, ChatModelRequest } from '@/core/ports';

export type ChatModelErrorCode =
  'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

/** What the provider should answer to the next `generateReply` call. */
export type ChatModelScenario =
  | {
      kind: 'completed';
      output: { reply: string; needsAdmin: boolean; handoffReason: ModelHandoffReason | null };
    }
  /** The answer is complete but its JSON does not match the schema. */
  | { kind: 'invalid_output' }
  | { kind: 'refused' }
  | { kind: 'truncated' }
  /** The provider gives no answer at all. */
  | { kind: 'error'; code: ChatModelErrorCode };

/**
 * `arrange` sets up the next answer: the fake queues it, the real adapter tells the Anthropic stub
 * (stubs-and-fixtures section 5). It applies to the next call only.
 */
export interface ChatModelHarness {
  chatModel: ChatModel;
  arrange(scenario: ChatModelScenario): Promise<void>;
}

const request = (): ChatModelRequest => ({
  model: 'claude-opus-5-5',
  systemInstructions: 'You are a helpful assistant.',
  knowledgeText: '<knowledge>\n</knowledge>',
  history: [{ role: 'customer', text: 'เปิดกี่โมงคะ' }],
  now: new Date('2026-11-18T03:00:00Z'),
  maxTokens: 1000,
});

const expectUsage = (usage: unknown): void => {
  expect(usage).toEqual({
    inputTokens: expect.any(Number) as number,
    outputTokens: expect.any(Number) as number,
    cacheReadTokens: expect.any(Number) as number,
    cacheWriteTokens: expect.any(Number) as number,
  });
};

/** Runs every row of the ChatModel table in domain-and-ports against the subject. */
export const describeChatModelSuite = (
  makeHarness: () => ChatModelHarness | Promise<ChatModelHarness>,
): void => {
  describe('ChatModel.generateReply', () => {
    it('returns ok with the validated output, usage and served model for a completed answer', async () => {
      const h = await makeHarness();
      await h.arrange({
        kind: 'completed',
        output: { reply: 'เปิด 9 โมงค่ะ', needsAdmin: false, handoffReason: null },
      });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('completed');
      expect(result.value.output).toEqual({
        reply: 'เปิด 9 โมงค่ะ',
        needsAdmin: false,
        handoffReason: null,
      });
      expectUsage(result.value.usage);
      expect(result.value.servedModel.length).toBeGreaterThan(0);
    });

    it('keeps the handoff reason the model gave', async () => {
      const h = await makeHarness();
      await h.arrange({
        kind: 'completed',
        output: { reply: 'ขอให้แอดมินดูแลนะคะ', needsAdmin: true, handoffReason: 'not_in_knowledge' },
      });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok && result.value.output).toEqual({
        reply: 'ขอให้แอดมินดูแลนะคะ',
        needsAdmin: true,
        handoffReason: 'not_in_knowledge',
      });
    });

    it('reports the reason as other when needsAdmin is true and the model gave none', async () => {
      const h = await makeHarness();
      await h.arrange({
        kind: 'completed',
        output: { reply: 'ขอให้แอดมินดูแลนะคะ', needsAdmin: true, handoffReason: null },
      });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok && result.value.output?.handoffReason).toBe('other');
    });

    it('returns output null with stop completed when the answer does not match the schema', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'invalid_output' });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('completed');
      expect(result.value.output).toBeNull();
      expectUsage(result.value.usage);
    });

    it('returns ok with usage and no output for a refusal', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'refused' });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('refused');
      expect(result.value.output).toBeNull();
      expectUsage(result.value.usage);
    });

    it('returns ok with usage and no output for a truncated answer', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'truncated' });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('truncated');
      expect(result.value.output).toBeNull();
      expectUsage(result.value.usage);
    });

    it.each<ChatModelErrorCode>([
      'ai.unavailable',
      'ai.rate_limited',
      'ai.auth_failed',
      'ai.bad_request',
    ])('returns %s only when the provider gave no answer', async (code) => {
      const h = await makeHarness();
      await h.arrange({ kind: 'error', code });
      const result = await h.chatModel.generateReply(request());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    });
  });
};
