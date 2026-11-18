import type { NanoUsd, TokenUsage } from '@/core/domain';
import type { UsageByContactRow } from '@/core/ports';
import { ok, requireBangkokMonthRange } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export interface UsageReport {
  month: string;
  priceTableDate: string;
  contacts: UsageByContactRow[];
  ingest: { count: number; usage: TokenUsage; cost: NanoUsd };
  /** Topic guard checks, the settings-page tests included. */
  guard: { count: number; usage: TokenUsage; cost: NanoUsd };
  /** Contacts + ingest + guard. */
  totalCost: NanoUsd;
  replyCount: number;
  /** null when there is no reply with outcome ok. */
  averageCostPerReply: NanoUsd | null;
}

export type GetUsageReportInput = { month: string };

export type GetUsageReportOutput = UsageReport;

export type GetUsageReportDeps = Pick<AllPorts, 'usage'>;

export const makeGetUsageReport: (
  deps: GetUsageReportDeps,
  config: UseCaseConfig,
) => UseCase<GetUsageReportInput, GetUsageReportOutput> =
  ({ usage }, config) =>
  async ({ month }) => {
    const range = requireBangkokMonthRange(month);
    const [rows, ingest, guard] = await Promise.all([
      usage.reportByContact(range),
      usage.ingestSummary(range),
      usage.guardSummary(range),
    ]);

    const replyCost = rows.reduce((sum, r) => sum + r.cost, 0n);
    const okCount = rows.reduce((sum, r) => sum + r.okCount, 0);
    return ok({
      month,
      priceTableDate: config.priceTable.asOf,
      contacts: rows,
      ingest,
      guard,
      totalCost: (replyCost + ingest.cost + guard.cost) as NanoUsd, // brand: sum of NanoUsd values
      replyCount: rows.reduce((sum, r) => sum + r.replyCount, 0),
      averageCostPerReply: okCount > 0 ? ((replyCost / BigInt(okCount)) as NanoUsd) : null, // brand: ratio of NanoUsd to a count
    });
  };
