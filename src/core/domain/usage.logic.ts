import type { NanoUsd } from './ids';
import type { ErrorCode } from './result';
import type { AiUsageRecord, TokenUsage } from './usage.model';

/** Token counts of a call that got no answer: the provider did not say, so they are zero. */
const NO_TOKENS: TokenUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

/** A model error that means the request may have reached the provider (usage-cost). */
export const isNoResponse = (code: ErrorCode): boolean => code === 'ai.no_response';

/**
 * The AiUsage row of a call that was sent and did not return: outcome failed, zero tokens and
 * cost, error `ai.no_response`. The provider may still bill it, so the report counts these rows.
 */
export const noResponseUsage = (
  r: Pick<
    AiUsageRecord,
    'id' | 'kind' | 'contactId' | 'documentId' | 'provider' | 'model' | 'createdAt'
  >,
): AiUsageRecord => ({
  ...r,
  messageId: null,
  usage: { ...NO_TOKENS },
  cost: 0n as NanoUsd, // brand: zero nano-USD
  outcome: 'failed',
  error: 'ai.no_response',
});
