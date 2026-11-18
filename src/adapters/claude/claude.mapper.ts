import Anthropic from '@anthropic-ai/sdk';
import type { AiModelId, Result, TokenUsage } from '@/core/domain';
import { err } from '@/core/domain';
import { CLAUDE_DEFAULT_BASE_URL, CLAUDE_FALLBACK_BETA } from './claude.constants';

export type ClaudeErrorCode =
  'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

/** What both Claude factories take. The adapters never read `process.env`. */
export interface ClaudeAdapterOptions {
  /** ANTHROPIC_API_KEY. */
  apiKey: string;
  /** ANTHROPIC_BASE_URL (the stub in tests). Undefined means the public API. */
  baseURL?: string;
}

/** One SDK client per use, because timeout and retries differ between reply, extraction and guard. */
export const createClaudeClient = (
  options: ClaudeAdapterOptions,
  limits: { timeoutMs: number; maxRetries: number },
): Anthropic =>
  new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? CLAUDE_DEFAULT_BASE_URL,
    timeout: limits.timeoutMs,
    maxRetries: limits.maxRetries,
    // Prompts, replies and knowledge text must never reach logs or traces, whatever
    // ANTHROPIC_LOG or the ANTHROPIC_OPEN_TELEMETRY* variables say.
    logLevel: 'off',
    openTelemetry: false,
  });

/**
 * Whether a request carries the server-side refusal fallback (domain-and-ports, Claude adapter).
 * Requests without it go to the non-beta endpoint. The one place to change this decision.
 *
 * - Haiku 5.5 has no server-side fallback.
 * - Sonnet 5.5 chat replies: left out on purpose. The fallback target of Sonnet 5.5 is Sonnet 5,
 *   which does not take mid-conversation system messages, and the fallback docs say a request must
 *   be valid on every model it can fall back to. Whether `fallbacks: "default"` rejects such a
 *   request up front is not documented, so the reply is sent without the fallback rather than
 *   risk a 400 on every reply. A refusal then hands the chat to an admin, as for Haiku.
 * - Opus 5.5 (targets Opus 5 and Opus 4.8, both take system messages and structured output) and
 *   extraction on Sonnet 5.5 (no system message) keep it.
 */
export const usesServerFallback = (model: AiModelId, use: 'reply' | 'extract'): boolean => {
  if (model === 'claude-haiku-5-5') return false;
  if (model === 'claude-sonnet-5-5') return use === 'extract';
  return true;
};

/** The beta endpoint moves `betas` into the `anthropic-beta` header. */
export const fallbackParams = (): Pick<
  Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  'betas' | 'fallbacks'
> => ({ betas: [CLAUDE_FALLBACK_BETA], fallbacks: 'default' });

type AnyMessage = Anthropic.Message | Anthropic.Beta.BetaMessage;

export type ClaudeStop = 'completed' | 'refused' | 'truncated';

/**
 * Reading order of domain-and-ports: refusal, then max_tokens, then anything that is not end_turn.
 * `text` is null unless the answer ended normally.
 */
export const readMessage = (
  message: AnyMessage,
): { stop: ClaudeStop; text: string | null; usage: TokenUsage; servedModel: string } => {
  const base = { usage: toTokenUsage(message), servedModel: message.model };
  const reason = message.stop_reason;
  if (reason === 'refusal') return { stop: 'refused', text: null, ...base };
  if (reason === 'max_tokens') return { stop: 'truncated', text: null, ...base };
  if (reason === 'end_turn') return { stop: 'completed', text: joinTextBlocks(message), ...base };
  // tool_use, pause_turn, stop_sequence, ... should not happen: treated as off-schema.
  return { stop: 'completed', text: null, ...base };
};

/**
 * Joins the `text` blocks and skips every other type (thinking, fallback, ...). After a server-side
 * fallback during a stream, the declined model's partial text stays in `content` before the last
 * `fallback` block, so only the text after that block is the answer.
 */
export const joinTextBlocks = (message: AnyMessage): string => {
  const content: readonly { type: string }[] = message.content;
  const lastFallback = content.map((block) => block.type).lastIndexOf('fallback');
  let text = '';
  for (const block of message.content.slice(lastFallback + 1)) {
    if (block.type === 'text') text += block.text;
  }
  return text;
};

/**
 * Billed tokens of the call. Top-level usage covers only the attempt that produced the message: a
 * model that declined before a server-side fallback is billed too but appears only in
 * `usage.iterations` (one entry per attempt, the serving one included), and compaction entries are
 * never in the top-level counts (BetaIterationsUsage in the SDK types). So when iterations are
 * present their sum replaces the top level; adding both would count the serving attempt twice.
 * `servedModel` stays `message.model`, the model of the final message. The non-beta endpoint has no
 * iterations. Missing or null counts become 0.
 */
export const toTokenUsage = (message: AnyMessage): TokenUsage => {
  const { usage } = message;
  const iterations = 'iterations' in usage ? usage.iterations : null;
  if (iterations !== null && iterations.length > 0) {
    return iterations.reduce<TokenUsage>(
      (sum, entry) => ({
        inputTokens: sum.inputTokens + entry.input_tokens,
        outputTokens: sum.outputTokens + entry.output_tokens,
        cacheReadTokens: sum.cacheReadTokens + entry.cache_read_input_tokens,
        cacheWriteTokens: sum.cacheWriteTokens + entry.cache_creation_input_tokens,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    );
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
};

/**
 * Maps an SDK error to the port's codes, most specific first. Only SDK errors are mapped; anything
 * else is a bug in this code and is rethrown. `detail` carries the status and class only, never the
 * API's message.
 */
export const mapClaudeError = (error: unknown): Result<never, ClaudeErrorCode> => {
  if (!(error instanceof Anthropic.AnthropicError)) throw error;
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) {
    // APIConnectionError, APIConnectionTimeoutError, APIUserAbortError, or a broken stream.
    return err('ai.unavailable', error.constructor.name);
  }
  const detail = `${error.constructor.name} ${String(error.status)}`;
  if (error instanceof Anthropic.RateLimitError) {
    return err('ai.rate_limited', detail, retryAfterSeconds(error.headers));
  }
  if (error instanceof Anthropic.AuthenticationError || error.status === 403) {
    return err('ai.auth_failed', detail);
  }
  if (error instanceof Anthropic.BadRequestError) return err('ai.bad_request', detail);
  if (error.status >= 500 || error.status === 408 || error.status === 409) {
    return err('ai.unavailable', detail);
  }
  // Other 4xx (402, 404, 413, 422, ...): the request cannot succeed as sent.
  return err('ai.bad_request', detail);
};

const retryAfterSeconds = (headers: Headers | undefined): number | undefined => {
  const value = headers?.get('retry-after');
  if (value === null || value === undefined) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
};
