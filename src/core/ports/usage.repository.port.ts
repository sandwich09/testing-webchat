import type { AiUsageRecord, ContactId, NanoUsd, TokenUsage } from '@/core/domain';

/** [from, to) */
export interface DateRange {
  from: Date;
  to: Date;
}

export interface UsageByContactRow {
  /** null when the Contact was deleted by the runbook. */
  contactId: ContactId | null;
  displayName: string | null;
  pictureUrl: string | null;
  /** Rows with kind reply, every outcome. Guard rows are in guardSummary. */
  replyCount: number;
  /** Rows with kind reply and outcome ok. */
  okCount: number;
  /** Sum. */
  usage: TokenUsage;
  cost: NanoUsd;
}

export interface UsageRepository {
  insert(r: AiUsageRecord): Promise<void>;
  sumCost(range: DateRange): Promise<NanoUsd>;
  reportByContact(range: DateRange): Promise<UsageByContactRow[]>;
  ingestSummary(range: DateRange): Promise<{ count: number; usage: TokenUsage; cost: NanoUsd }>;
  /** Rows with kind guard, every outcome, the settings-page tests included. */
  guardSummary(range: DateRange): Promise<{ count: number; usage: TokenUsage; cost: NanoUsd }>;
  /**
   * guardBlocked: kind guard with outcome blocked. outputRejected: every kind whose error is
   * ai.invalid_output or ai.refused.
   */
  countSafetyOutcomes(range: DateRange): Promise<{ guardBlocked: number; outputRejected: number }>;
  /** Rows of every kind in the range whose error is ai.no_response: sent, no answer, cost unknown. */
  countNoResponse(range: DateRange): Promise<number>;
  listForContact(contactId: ContactId, range: DateRange): Promise<AiUsageRecord[]>;
}
