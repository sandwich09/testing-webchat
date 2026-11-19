import type { AiModelId, ChatTurn, Result, TopicGuardResponse } from '@/core/domain';

// TopicVerdict and TopicGuardResponse are declared in the domain (topic-guard.model.ts) because
// guardVerdictOf consumes them. They are re-exported here, as ChatTurn is by the ChatModel port.
export type { TopicGuardResponse, TopicVerdict } from '@/core/domain';

export interface TopicGuardRequest {
  /** The saved topics, not empty. */
  topics: string[];
  /** The latest customer turn, from guardContextTurns. */
  message: string;
  /** At most GUARD_CONTEXT_TURNS earlier turns, so a follow-up such as "ขออีกมุก" can be judged. */
  context: ChatTurn[];
  /** GUARD_MODEL */
  model: AiModelId;
  /** GUARD_MAX_TOKENS */
  maxTokens: number;
  /** GUARD_TIMEOUT_MS, the timeout of this one request. */
  timeoutMs: number;
}

/**
 * Checks whether the latest customer message is inside the shop's topics, with a model call of its
 * own (ADR 0020). Every answer from the API, refusals and truncated answers included, is `ok` with
 * usage; an error means the API gave no answer.
 */
export interface TopicGuard {
  classify(
    req: TopicGuardRequest,
  ): Promise<
    Result<
      TopicGuardResponse,
      'ai.unavailable' | 'ai.no_response' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request'
    >
  >;
}
