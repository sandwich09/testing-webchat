import type { TokenUsage } from './usage.model';

// Declared in the domain (not the TopicGuard port) because guardVerdictOf uses them and the domain
// cannot import ports. The port re-exports them, as with ChatTurn.

/** The classifier output after zod validation (ai-prompt section 9.3). */
export interface TopicVerdict {
  allowed: boolean;
  matchedTopic: string | null;
}

export interface TopicGuardResponse {
  stop: 'completed' | 'refused' | 'truncated';
  /** null when stop is not completed or the answer did not match the schema. */
  verdict: TopicVerdict | null;
  usage: TokenUsage;
  /** Model name reported by the API. */
  servedModel: string;
}
