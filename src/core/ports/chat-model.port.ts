import type { AiModelId, ChatModelResponse, ChatTurn, Result } from '@/core/domain';

// ChatRole, ChatTurn, ChatOutput and ChatModelResponse are declared in the domain
// (chat.model.ts) because domain functions consume them. They are re-exported here.
export type { ChatModelResponse, ChatOutput, ChatRole, ChatTurn } from '@/core/domain';

export interface ChatModelRequest {
  model: AiModelId;
  /** From buildSystemInstructions. */
  systemInstructions: string;
  /** From KnowledgeSource, always a <knowledge> block (an empty library is an empty block). */
  knowledgeText: string;
  /** From toHistoryTurns: not empty and ends with a customer turn. */
  history: ChatTurn[];
  /** Current time from the Clock port, formatted by formatPromptNow. */
  now: Date;
  /** AI_MAX_TOKENS. */
  maxTokens: number;
}

export interface ChatModel {
  generateReply(
    req: ChatModelRequest,
  ): Promise<
    Result<
      ChatModelResponse,
      'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request'
    >
  >;
}
