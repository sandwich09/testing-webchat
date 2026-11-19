import type { AiModelId, Result, TokenUsage } from '@/core/domain';

export interface ExtractRequest {
  model: AiModelId;
  /** Size and type already checked. */
  pdf: Uint8Array;
  /** AI_EXTRACT_MAX_TOKENS. */
  maxTokens: number;
}

export interface ExtractResponse {
  stop: 'completed' | 'refused' | 'truncated';
  /** null when stop is not completed or the text is empty. */
  text: string | null;
  pageCount: number | null;
  usage: TokenUsage;
  servedModel: string;
}

export interface DocumentExtractor {
  extract(
    req: ExtractRequest,
  ): Promise<
    Result<
      ExtractResponse,
      'ai.unavailable' | 'ai.no_response' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request'
    >
  >;

  /** Counts tokens of the text with the tokenizer of that model. */
  countTokens(
    model: AiModelId,
    text: string,
  ): Promise<
    Result<
      number,
      'ai.unavailable' | 'ai.no_response' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request'
    >
  >;
}
