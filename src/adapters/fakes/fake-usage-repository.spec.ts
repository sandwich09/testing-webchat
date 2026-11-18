import { describe, expect, it } from 'vitest';
import type { ContactId, NanoUsd, UsageId } from '@/core/domain';
import { describeUsageRepositorySuite } from './suites/usage-repository.suite';
import { FakeContactRepository } from './fake-contact-repository';
import { FakeUsageRepository } from './fake-usage-repository';

describeUsageRepositorySuite(() => {
  const contacts = new FakeContactRepository();
  return { contacts, usage: new FakeUsageRepository({ contacts }) };
});

describe('FakeUsageRepository', () => {
  it('exposes the stored rows oldest first and rejects a repeated id', async () => {
    const repo = new FakeUsageRepository();
    const row = {
      id: '33333333-0000-7000-8000-000000000001' as UsageId, // brand: test id
      kind: 'reply' as const,
      contactId: '00000000-0000-7000-8000-000000000001' as ContactId, // brand: test id
      messageId: null,
      documentId: null,
      provider: 'claude' as const,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: 5n as NanoUsd, // brand: test amount
      outcome: 'ok' as const,
      error: null,
      createdAt: new Date('2026-11-18T03:00:00.000Z'),
    };
    await repo.insert(row);
    await expect(repo.insert(row)).rejects.toThrow();
    expect(repo.records).toEqual([row]);
    // Without a contact repository the join has no names.
    const [report] = await repo.reportByContact({
      from: new Date('2026-11-18T00:00:00.000Z'),
      to: new Date('2026-11-19T00:00:00.000Z'),
    });
    expect(report).toMatchObject({ contactId: row.contactId, displayName: null });
  });
});
