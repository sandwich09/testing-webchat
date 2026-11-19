import type {
  AiUsageRecord,
  ContactId,
  NanoUsd,
  TokenUsage,
  UsageId,
  UsageKind,
} from '@/core/domain';
import type { DateRange, UsageByContactRow, UsageRepository } from '@/core/ports';
import type { FakeContactRepository } from './fake-contact-repository';

const inRange = (r: AiUsageRecord, range: DateRange): boolean =>
  r.createdAt.getTime() >= range.from.getTime() && r.createdAt.getTime() < range.to.getTime();

const zeroUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

const addUsage = (sum: TokenUsage, u: TokenUsage): void => {
  sum.inputTokens += u.inputTokens;
  sum.outputTokens += u.outputTokens;
  sum.cacheReadTokens += u.cacheReadTokens;
  sum.cacheWriteTokens += u.cacheWriteTokens;
};

const nano = (n: bigint): NanoUsd => n as NanoUsd; // brand: sums of NanoUsd values

/**
 * In-memory UsageRepository. Build it with `{ contacts }` so `reportByContact` can join the
 * display name and picture, as the SQL join on Contact does.
 */
export class FakeUsageRepository implements UsageRepository {
  private readonly contacts: FakeContactRepository | null;
  private readonly rows = new Map<UsageId, AiUsageRecord>();

  constructor(options: { contacts?: FakeContactRepository } = {}) {
    this.contacts = options.contacts ?? null;
  }

  /** Every stored row, oldest first. For assertions in use-case tests. */
  get records(): AiUsageRecord[] {
    return [...this.rows.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => structuredClone(r));
  }

  readonly insert: UsageRepository['insert'] = (r) => {
    if (this.rows.has(r.id)) {
      return Promise.reject(new Error('FakeUsageRepository.insert: id already used'));
    }
    this.rows.set(r.id, structuredClone(r));
    return Promise.resolve();
  };

  readonly sumCost: UsageRepository['sumCost'] = (range) => {
    let sum = 0n;
    for (const r of this.rows.values()) if (inRange(r, range)) sum += r.cost;
    return Promise.resolve(nano(sum));
  };

  readonly reportByContact: UsageRepository['reportByContact'] = (range) => {
    const groups = new Map<ContactId | null, UsageByContactRow>();
    for (const r of this.rows.values()) {
      if (r.kind !== 'reply' || !inRange(r, range)) continue;
      let row = groups.get(r.contactId);
      if (!row) {
        const contact = r.contactId === null ? null : (this.contacts?.peek(r.contactId) ?? null);
        row = {
          contactId: r.contactId,
          displayName: contact?.displayName ?? null,
          pictureUrl: contact?.pictureUrl ?? null,
          replyCount: 0,
          okCount: 0,
          usage: zeroUsage(),
          cost: nano(0n),
        };
        groups.set(r.contactId, row);
      }
      row.replyCount += 1;
      if (r.outcome === 'ok') row.okCount += 1;
      addUsage(row.usage, r.usage);
      row.cost = nano(row.cost + r.cost);
    }
    return Promise.resolve(
      [...groups.values()].sort((a, b) => (a.cost > b.cost ? -1 : a.cost < b.cost ? 1 : 0)),
    );
  };

  private summary(kind: UsageKind, range: DateRange) {
    const usage = zeroUsage();
    let count = 0;
    let cost = 0n;
    for (const r of this.rows.values()) {
      if (r.kind !== kind || !inRange(r, range)) continue;
      count += 1;
      cost += r.cost;
      addUsage(usage, r.usage);
    }
    return Promise.resolve({ count, usage, cost: nano(cost) });
  }

  readonly ingestSummary: UsageRepository['ingestSummary'] = (range) =>
    this.summary('ingest', range);

  readonly guardSummary: UsageRepository['guardSummary'] = (range) => this.summary('guard', range);

  readonly countSafetyOutcomes: UsageRepository['countSafetyOutcomes'] = (range) => {
    let guardBlocked = 0;
    let outputRejected = 0;
    for (const r of this.rows.values()) {
      if (!inRange(r, range)) continue;
      if (r.kind === 'guard' && r.outcome === 'blocked') guardBlocked += 1;
      if (r.error === 'ai.invalid_output' || r.error === 'ai.refused') outputRejected += 1;
    }
    return Promise.resolve({ guardBlocked, outputRejected });
  };

  readonly countNoResponse: UsageRepository['countNoResponse'] = (range) =>
    Promise.resolve(
      [...this.rows.values()].filter((r) => inRange(r, range) && r.error === 'ai.no_response')
        .length,
    );

  readonly listForContact: UsageRepository['listForContact'] = (contactId, range) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.contactId === contactId && inRange(r, range))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((r) => structuredClone(r)),
    );
}
