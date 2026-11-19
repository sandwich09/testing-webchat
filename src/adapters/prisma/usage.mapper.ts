import type {
  AiProvider,
  AiUsageRecord,
  ContactId,
  DocumentId,
  ErrorCode,
  MessageId,
  TokenUsage,
  UsageId,
} from '@/core/domain';
import type { AiUsage as AiUsageRow } from './generated/client';
import { decimalStringToNano } from './money.mapper';

export function toAiUsageRecord(row: AiUsageRow): AiUsageRecord {
  return {
    id: row.id as UsageId, // brand: UUIDv7 made by IdGenerator
    kind: row.kind,
    contactId: row.contactId as ContactId | null, // brand: UUIDv7
    messageId: row.messageId as MessageId | null, // brand: UUIDv7
    documentId: row.documentId as DocumentId | null, // brand: UUIDv7
    provider: row.provider as AiProvider, // brand: only 'claude' is ever written
    model: row.model satisfies string,
    usage: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
    },
    cost: decimalStringToNano(row.costUsd.toFixed(9)),
    outcome: row.outcome,
    error: row.error as ErrorCode | null, // brand: the column holds an error-catalog code
    createdAt: row.createdAt,
  };
}

export const sumTokenUsage = (u: {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}): TokenUsage => ({
  inputTokens: u.inputTokens ?? 0,
  outputTokens: u.outputTokens ?? 0,
  cacheReadTokens: u.cacheReadTokens ?? 0,
  cacheWriteTokens: u.cacheWriteTokens ?? 0,
});
