import type { ModelHandoffReason } from './enums.model';
import type { TokenUsage } from './usage.model';

// Defined in the domain (not the ChatModel port) because the pure functions toHistoryTurns and
// usageOutcomeOf use them and the domain cannot import ports. The port re-exports them.

export type ChatRole = 'customer' | 'shop';

export interface ChatTurn {
  role: ChatRole;
  text: string;
}

export interface ChatOutput {
  reply: string;
  needsAdmin: boolean;
  handoffReason: ModelHandoffReason | null;
}

export interface ChatModelResponse {
  stop: 'completed' | 'refused' | 'truncated';
  /** null when stop is not completed or the answer did not match the schema. */
  output: ChatOutput | null;
  usage: TokenUsage;
  /** Model name reported by the API. */
  servedModel: string;
}
