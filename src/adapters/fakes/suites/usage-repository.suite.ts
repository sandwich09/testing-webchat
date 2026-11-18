import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AiUsageRecord,
  ContactId,
  LineUserId,
  NanoUsd,
  UsageId,
  UsageKind,
} from '@/core/domain';
import type { ContactRepository, DateRange, UsageRepository } from '@/core/ports';

/** The suite needs contacts as well: reportByContact joins the display name and picture. */
export interface UsageRepositorySuiteHarness {
  usage: UsageRepository;
  contacts: ContactRepository;
}

const usageId = (n: number): UsageId =>
  `33333333-0000-7000-8000-${n.toString(16).padStart(12, '0')}` as UsageId; // brand: test id
const contactId = (n: number): ContactId =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}` as ContactId; // brand: test id
const lineUser = (n: number): LineUserId => `U${n.toString(16).padStart(32, '0')}` as LineUserId; // brand: test id
const usd = (n: bigint): NanoUsd => n as NanoUsd; // brand: test amount in nano-USD
const at = (iso: string): Date => new Date(iso);

// One Bangkok day (UTC+7): 2026-11-18 00:00 to 2026-11-19 00:00 local time, written out in UTC.
const DAY: DateRange = { from: at('2026-11-17T17:00:00.000Z'), to: at('2026-11-18T17:00:00.000Z') };

let nextUsage = 0;
const record = (
  over: Partial<AiUsageRecord> & { kind: UsageKind; cost: NanoUsd; createdAt: Date },
): AiUsageRecord => {
  nextUsage += 1;
  return {
    id: usageId(nextUsage),
    contactId: null,
    messageId: null,
    documentId: null,
    provider: 'claude',
    model: 'claude-opus-5-5',
    usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
    outcome: 'ok',
    error: null,
    ...over,
  };
};

/**
 * Runs the UsageRepository contract (docs/architecture/domain-and-ports.md) against the subject.
 * Ranges are half-open [from, to) on createdAt; the Bangkok-day range is computed by the caller.
 *
 * `makeHarness` runs before every test and must return both repositories over empty AiUsage and
 * Contact tables, backed by the same store (one database, or fakes wired with `{ contacts }`).
 */
export const describeUsageRepositorySuite = (
  makeHarness: () => UsageRepositorySuiteHarness | Promise<UsageRepositorySuiteHarness>,
): void => {
  describe('UsageRepository contract', () => {
    let repo: UsageRepository;
    let contacts: ContactRepository;

    beforeEach(async () => {
      nextUsage = 0;
      ({ usage: repo, contacts } = await makeHarness());
      for (const n of [1, 2]) {
        await contacts.ensure({ id: contactId(n), lineUserId: lineUser(n), now: DAY.from });
      }
      await contacts.updateProfile(contactId(1), {
        displayName: 'คุณส้ม',
        pictureUrl: 'https://profile.line-scdn.net/1',
      });
    });

    describe('sumCost', () => {
      it('is 0 with no rows', async () => {
        expect(await repo.sumCost(DAY)).toBe(0n);
      });

      it('sums every kind and outcome in [from, to) exactly', async () => {
        await repo.insert(record({ kind: 'reply', cost: usd(1n), createdAt: DAY.from }));
        await repo.insert(
          record({
            kind: 'reply',
            outcome: 'failed',
            cost: usd(123_456_789_012n),
            createdAt: at('2026-11-18T10:00:00.000Z'),
            contactId: contactId(1),
          }),
        );
        await repo.insert(
          record({ kind: 'ingest', cost: usd(500n), createdAt: at('2026-11-18T16:59:59.999Z') }),
        );
        // Outside: the end is exclusive, and the previous Bangkok day.
        await repo.insert(record({ kind: 'reply', cost: usd(7_000n), createdAt: DAY.to }));
        await repo.insert(
          record({ kind: 'reply', cost: usd(9_000n), createdAt: at('2026-11-17T16:59:59.999Z') }),
        );
        expect(await repo.sumCost(DAY)).toBe(123_456_789_513n);
      });
    });

    it('reportByContact groups reply rows by contact, most expensive first', async () => {
      const t = at('2026-11-18T05:00:00.000Z');
      const c1 = contactId(1);
      const c2 = contactId(2);
      await repo.insert(record({ kind: 'reply', contactId: c1, cost: usd(100n), createdAt: t }));
      await repo.insert(
        record({ kind: 'reply', contactId: c1, outcome: 'handoff', cost: usd(50n), createdAt: t }),
      );
      await repo.insert(record({ kind: 'reply', contactId: c2, cost: usd(500n), createdAt: t }));
      await repo.insert(record({ kind: 'reply', contactId: null, cost: usd(10n), createdAt: t }));
      await repo.insert(record({ kind: 'ingest', cost: usd(9_999n), createdAt: t }));
      await repo.insert(
        record({ kind: 'reply', contactId: c1, cost: usd(9_999n), createdAt: DAY.to }),
      );

      expect(await repo.reportByContact(DAY)).toEqual([
        {
          contactId: c2,
          displayName: null,
          pictureUrl: null,
          replyCount: 1,
          okCount: 1,
          usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
          cost: 500n,
        },
        {
          contactId: c1,
          displayName: 'คุณส้ม',
          pictureUrl: 'https://profile.line-scdn.net/1',
          replyCount: 2,
          okCount: 1,
          usage: { inputTokens: 2, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 8 },
          cost: 150n,
        },
        {
          contactId: null,
          displayName: null,
          pictureUrl: null,
          replyCount: 1,
          okCount: 1,
          usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
          cost: 10n,
        },
      ]);
      expect(await repo.reportByContact({ from: DAY.to, to: DAY.to })).toEqual([]);
    });

    it('ingestSummary sums ingest rows in the range', async () => {
      expect(await repo.ingestSummary(DAY)).toEqual({
        count: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cost: 0n,
      });
      const t = at('2026-11-18T05:00:00.000Z');
      await repo.insert(record({ kind: 'ingest', cost: usd(300n), createdAt: t }));
      await repo.insert(
        record({
          kind: 'ingest',
          outcome: 'failed',
          error: 'knowledge.extract_failed',
          usage: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          cost: usd(20n),
          createdAt: t,
        }),
      );
      await repo.insert(
        record({ kind: 'reply', contactId: contactId(1), cost: usd(1n), createdAt: t }),
      );
      await repo.insert(record({ kind: 'ingest', cost: usd(4_000n), createdAt: DAY.to }));
      expect(await repo.ingestSummary(DAY)).toEqual({
        count: 2,
        usage: { inputTokens: 11, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
        cost: 320n,
      });
    });

    it('reportByContact leaves out guard rows and counts a blocked reply but not as ok', async () => {
      const t = at('2026-11-18T05:00:00.000Z');
      const c1 = contactId(1);
      await repo.insert(record({ kind: 'reply', contactId: c1, cost: usd(100n), createdAt: t }));
      await repo.insert(
        record({ kind: 'reply', contactId: c1, outcome: 'blocked', cost: usd(30n), createdAt: t }),
      );
      await repo.insert(record({ kind: 'guard', contactId: c1, cost: usd(7n), createdAt: t }));
      await repo.insert(
        record({ kind: 'guard', contactId: c1, outcome: 'blocked', cost: usd(8n), createdAt: t }),
      );
      expect(await repo.reportByContact(DAY)).toEqual([
        {
          contactId: c1,
          displayName: 'คุณส้ม',
          pictureUrl: 'https://profile.line-scdn.net/1',
          replyCount: 2,
          okCount: 1,
          usage: { inputTokens: 2, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 8 },
          cost: 130n,
        },
      ]);
    });

    it('guardSummary sums guard rows of every outcome in the range, the settings tests included', async () => {
      expect(await repo.guardSummary(DAY)).toEqual({
        count: 0,
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cost: 0n,
      });
      const t = at('2026-11-18T05:00:00.000Z');
      await repo.insert(
        record({ kind: 'guard', contactId: contactId(1), cost: usd(5n), createdAt: t }),
      );
      await repo.insert(
        record({
          kind: 'guard',
          contactId: contactId(2),
          outcome: 'blocked',
          cost: usd(6n),
          createdAt: DAY.from,
        }),
      );
      // A test from the settings page has no contact.
      await repo.insert(
        record({
          kind: 'guard',
          outcome: 'failed',
          error: 'ai.invalid_output',
          usage: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          cost: usd(123_456_789_012n),
          createdAt: at('2026-11-18T16:59:59.999Z'),
        }),
      );
      await repo.insert(
        record({ kind: 'reply', contactId: contactId(1), cost: usd(1n), createdAt: t }),
      );
      await repo.insert(record({ kind: 'ingest', cost: usd(1n), createdAt: t }));
      await repo.insert(record({ kind: 'guard', cost: usd(9_000n), createdAt: DAY.to }));
      expect(await repo.guardSummary(DAY)).toEqual({
        count: 3,
        usage: { inputTokens: 12, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 8 },
        cost: 123_456_789_023n,
      });
    });

    describe('countSafetyOutcomes', () => {
      it('is zero with no rows', async () => {
        expect(await repo.countSafetyOutcomes(DAY)).toEqual({ guardBlocked: 0, outputRejected: 0 });
      });

      it('counts guard rows blocked and rows of any kind rejected as invalid or refused', async () => {
        const t = at('2026-11-18T05:00:00.000Z');
        const c1 = contactId(1);
        const blocked = { outcome: 'blocked' as const, cost: usd(1n), createdAt: t };
        await repo.insert(record({ kind: 'guard', contactId: c1, ...blocked }));
        await repo.insert(record({ kind: 'guard', ...blocked, createdAt: DAY.from }));
        // Not guardBlocked: a blocked reply (second layer), a guard row that passed.
        await repo.insert(record({ kind: 'reply', contactId: c1, ...blocked }));
        await repo.insert(record({ kind: 'guard', contactId: c1, cost: usd(1n), createdAt: t }));
        const rejected = { outcome: 'failed' as const, cost: usd(1n), createdAt: t };
        await repo.insert(
          record({
            kind: 'reply',
            contactId: c1,
            ...rejected,
            outcome: 'refused',
            error: 'ai.refused',
          }),
        );
        await repo.insert(record({ kind: 'guard', ...rejected, error: 'ai.invalid_output' }));
        await repo.insert(
          record({ kind: 'reply', contactId: c1, ...rejected, error: 'ai.invalid_output' }),
        );
        // Not outputRejected: other errors.
        await repo.insert(
          record({ kind: 'reply', contactId: c1, ...rejected, error: 'ai.truncated' }),
        );
        await repo.insert(
          record({ kind: 'ingest', ...rejected, error: 'knowledge.extract_refused' }),
        );
        // Outside the range.
        await repo.insert(record({ kind: 'guard', ...blocked, createdAt: DAY.to }));
        await repo.insert(
          record({
            kind: 'guard',
            ...rejected,
            error: 'ai.refused',
            createdAt: at('2026-11-17T16:59:59.999Z'),
          }),
        );
        expect(await repo.countSafetyOutcomes(DAY)).toEqual({ guardBlocked: 2, outputRejected: 3 });
      });
    });

    it('listForContact returns that contact rows in the range, newest first, with every field', async () => {
      const c1 = contactId(1);
      const older = record({
        kind: 'reply',
        contactId: c1,
        model: 'claude-sonnet-5-5-fallback',
        outcome: 'refused',
        error: 'ai.refused',
        cost: usd(42n),
        createdAt: at('2026-11-18T01:00:00.000Z'),
      });
      const newer = record({
        kind: 'reply',
        contactId: c1,
        cost: usd(43n),
        createdAt: at('2026-11-18T02:00:00.000Z'),
      });
      const guard = record({
        kind: 'guard',
        contactId: c1,
        model: 'claude-haiku-5-5',
        outcome: 'blocked',
        messageId: null,
        cost: usd(2n),
        createdAt: at('2026-11-18T01:30:00.000Z'),
      });
      await repo.insert(older);
      await repo.insert(newer);
      await repo.insert(guard);
      await repo.insert(
        record({
          kind: 'reply',
          contactId: contactId(2),
          cost: usd(1n),
          createdAt: older.createdAt,
        }),
      );
      await repo.insert(record({ kind: 'reply', contactId: c1, cost: usd(1n), createdAt: DAY.to }));
      expect(await repo.listForContact(c1, DAY)).toEqual([newer, guard, older]);
    });
  });
};
