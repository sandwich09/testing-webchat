import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeUsageRepository,
} from '@/adapters/fakes';
import type { AiUsageRecord, ContactId, LineUserId, NanoUsd } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeGetUsageReport } from './get-usage-report.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: null };
const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const IN_NOVEMBER = new Date('2026-11-18T03:00:00.000Z');

describe('GetUsageReport', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let usage: FakeUsageRepository;
  let run: ReturnType<typeof makeGetUsageReport>;
  let contactId: ContactId;

  const add = (over: Partial<AiUsageRecord>) =>
    usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: 100n as NanoUsd, // brand: test amount
      outcome: 'ok',
      error: null,
      createdAt: IN_NOVEMBER,
      ...over,
    });
  const cost = (n: bigint): NanoUsd => n as NanoUsd; // brand: test amount

  beforeEach(async () => {
    clock = new FakeClock(IN_NOVEMBER);
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    usage = new FakeUsageRepository({ contacts });
    run = makeGetUsageReport({ usage }, config);
    ({
      contact: { id: contactId },
    } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: 'U-1' as LineUserId, // brand: test id
      now: clock.now(),
    }));
  });

  it('returns zeros and a null average for a month with no data', async () => {
    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value : null).toEqual({
      month: '2026-11',
      priceTableDate: PRICE_TABLE.asOf,
      contacts: [],
      ingest: { count: 0, usage: ZERO_USAGE, cost: 0n },
      guard: { count: 0, usage: ZERO_USAGE, cost: 0n },
      totalCost: 0n,
      replyCount: 0,
      averageCostPerReply: null,
      noResponseCount: 0,
    });
  });

  it('counts calls sent without an answer (ai.no_response) of the month in noResponseCount', async () => {
    await add({ cost: cost(0n), outcome: 'failed', error: 'ai.no_response' });
    await add({ cost: cost(0n), outcome: 'failed', error: 'ai.no_response' });
    await add({ cost: cost(100n), outcome: 'failed', error: 'ai.unavailable' });
    await add({
      cost: cost(0n),
      outcome: 'failed',
      error: 'ai.no_response',
      createdAt: new Date('2026-11-30T17:30:00.000Z'),
    });

    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value.noResponseCount : null).toBe(2);
  });

  it('counts a row made at 2026-11-30T17:30Z in the month 2026-12 (Bangkok time)', async () => {
    await add({ createdAt: new Date('2026-11-30T17:30:00.000Z') });

    const november = await run({ month: '2026-11' }, ctx);
    const december = await run({ month: '2026-12' }, ctx);

    expect(november.ok ? november.value.replyCount : null).toBe(0);
    expect(december.ok ? december.value.replyCount : null).toBe(1);
  });

  it('divides the average by the rows with outcome ok, not by every outcome', async () => {
    await add({ cost: cost(300n), outcome: 'ok' });
    await add({ cost: cost(100n), outcome: 'failed', error: 'ai.unavailable' });
    await add({ cost: cost(200n), outcome: 'handoff' });

    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value.replyCount : null).toBe(3);
    expect(result.ok ? result.value.averageCostPerReply : null).toBe(600n); // 600 / 1 ok
  });

  it('counts a kind reply row with outcome blocked in replyCount but not in okCount', async () => {
    await add({ cost: cost(100n), outcome: 'ok' });
    await add({ cost: cost(50n), outcome: 'blocked' });

    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value.replyCount : null).toBe(2);
    expect(result.ok ? result.value.contacts[0]?.okCount : null).toBe(1);
    expect(result.ok ? result.value.averageCostPerReply : null).toBe(150n);
  });

  it('keeps ingest apart from the contacts but inside totalCost', async () => {
    await add({ cost: cost(100n) });
    await add({ kind: 'ingest', contactId: null, documentId: ids.documentId(), cost: cost(40n) });

    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value.ingest.count : null).toBe(1);
    expect(result.ok ? result.value.ingest.cost : null).toBe(40n);
    expect(result.ok ? result.value.contacts : null).toHaveLength(1);
    expect(result.ok ? result.value.totalCost : null).toBe(140n);
    expect(result.ok ? result.value.averageCostPerReply : null).toBe(100n);
  });

  it('puts kind guard rows in guard, not in a contact row, and adds them to totalCost', async () => {
    await add({ cost: cost(100n) });
    await add({ kind: 'guard', contactId, cost: cost(7n), outcome: 'blocked' });
    await add({ kind: 'guard', contactId: null, cost: cost(3n), outcome: 'ok' });

    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value.guard.count : null).toBe(2);
    expect(result.ok ? result.value.guard.cost : null).toBe(10n);
    expect(result.ok ? result.value.contacts : null).toEqual([
      expect.objectContaining({ contactId, replyCount: 1, cost: 100n }),
    ]);
    expect(result.ok ? result.value.totalCost : null).toBe(110n);
    expect(result.ok ? result.value.replyCount : null).toBe(1);
  });

  it('shows a contact deleted by the runbook as a row with contactId null', async () => {
    await add({ contactId: null, cost: cost(25n) });

    const result = await run({ month: '2026-11' }, ctx);

    expect(result.ok ? result.value.contacts : null).toEqual([
      expect.objectContaining({ contactId: null, displayName: null, cost: 25n }),
    ]);
  });

  it('throws on a month the route should have rejected', async () => {
    await expect(run({ month: '2026-13' }, ctx)).rejects.toThrow();
  });
});
