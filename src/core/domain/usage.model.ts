import type { AiProvider, UsageKind, UsageOutcome } from './enums.model';
import type { ContactId, DocumentId, MessageId, NanoUsd, UsageId } from './ids';
import type { ErrorCode } from './result';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiUsageRecord {
  id: UsageId;
  kind: UsageKind;
  /** Set when kind is reply. */
  contactId: ContactId | null;
  /** The AI message that was sent, if any. */
  messageId: MessageId | null;
  /** Set when kind is ingest. */
  documentId: DocumentId | null;
  provider: AiProvider;
  /** Model reported by the API. May be outside AiModelId after a fallback switch. */
  model: string;
  usage: TokenUsage;
  cost: NanoUsd;
  outcome: UsageOutcome;
  error: ErrorCode | null;
  createdAt: Date;
}
