import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, FakeIdGenerator, FakeUsageRepository } from '@/adapters/fakes';
import type { AiUsageRecord, ContactId, NanoUsd } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeGetContactUsage } from './get-contact-usage.use-case';
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
const CONTACT = 'contact-1' as ContactId; // brand: test id
const OTHER = 'contact-2' as ContactId; // brand: test id

describe('GetContactUsage', () => {
  let ids: FakeIdGenerator;
  let usage: FakeUsageRepository;
  let run: ReturnType<typeof makeGetContactUsage>;

  const add = (contactId: ContactId, createdAt: Date) =>
    usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: 1n as NanoUsd, // brand: test amount
      outcome: 'ok',
      error: null,
      createdAt,
    } satisfies AiUsageRecord);

  beforeEach(() => {
    ids = new FakeIdGenerator(new FakeClock());
    usage = new FakeUsageRepository();
    run = makeGetContactUsage({ usage }, config);
  });

  it('returns only that contact rows of that month in Bangkok time, newest first', async () => {
    await add(CONTACT, new Date('2026-11-10T00:00:00.000Z'));
    await add(CONTACT, new Date('2026-11-20T00:00:00.000Z'));
    await add(CONTACT, new Date('2026-11-30T17:30:00.000Z')); // already December in Bangkok
    await add(OTHER, new Date('2026-11-15T00:00:00.000Z'));

    const result = await run({ contactId: CONTACT, month: '2026-11' }, ctx);

    expect(result.ok ? result.value.map((r) => r.createdAt.toISOString()) : null).toEqual([
      '2026-11-20T00:00:00.000Z',
      '2026-11-10T00:00:00.000Z',
    ]);
  });

  it('returns an empty list for a contact that does not exist', async () => {
    expect(await run({ contactId: CONTACT, month: '2026-11' }, ctx)).toEqual({
      ok: true,
      value: [],
    });
  });

  it('throws on a month the route should have rejected', async () => {
    await expect(run({ contactId: CONTACT, month: 'nope' }, ctx)).rejects.toThrow();
  });
});
