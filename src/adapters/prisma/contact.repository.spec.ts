import { afterAll, describe, expect, it } from 'vitest';
import type { ContactId, LineUserId } from '@/core/domain';
import { describeContactRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createContactRepository } from './contact.repository';
import { getPrismaClient } from './prisma-client';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

// Contact and every table that references it, so each test starts from empty tables.
const truncate = () => client.$executeRaw`TRUNCATE TABLE "AiUsage", "Message", "Contact"`;

const makeSubject = async () => {
  await truncate();
  return createContactRepository(client);
};

afterAll(async () => {
  await client.$disconnect();
});

describeContactRepositorySuite(makeSubject);

describe('Prisma ContactRepository', () => {
  const id = (n: number): ContactId =>
    `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}` as ContactId; // brand: test id
  const lineUser = (n: number): LineUserId => `U${n.toString(16).padStart(32, '0')}` as LineUserId; // brand: test id

  it('list maps raw rows to the same entities as findById', async () => {
    const repo = await makeSubject();
    await repo.ensure({
      id: id(1),
      lineUserId: lineUser(1),
      now: new Date('2026-11-18T01:00:00Z'),
    });
    await repo.updateProfile(id(1), { displayName: 'a\\b', pictureUrl: 'https://x.test/p' });
    await repo.recordInbound(id(1), {
      at: new Date('2026-11-18T02:00:00.123Z'),
      preview: { type: 'text', text: 'q' },
      replyToken: 'rt',
      replyTokenExpiresAt: new Date('2026-11-18T02:00:50Z'),
    });
    await repo.setNeedsAdmin(id(1), 'ai_failed');
    const listed = await repo.list({ filter: 'all', search: '\\', before: null, limit: 10 });
    expect(listed.contacts).toEqual([await repo.findById(id(1))]);
  });

  it('recordInbound with an equal timestamp replaces the last message', async () => {
    const repo = await makeSubject();
    await repo.ensure({
      id: id(1),
      lineUserId: lineUser(1),
      now: new Date('2026-11-18T01:00:00Z'),
    });
    const at = new Date('2026-11-18T02:00:00Z');
    await repo.recordOutbound(id(1), { at, preview: { type: 'text', text: 'a' }, by: 'admin' });
    await repo.recordInbound(id(1), {
      at,
      preview: { type: 'sticker', text: null },
      replyToken: null,
      replyTokenExpiresAt: null,
    });
    expect(await repo.findById(id(1))).toMatchObject({
      lastMessageAt: at,
      lastMessagePreview: null,
      lastMessageType: 'sticker',
      lastMessageBy: 'customer',
      replyToken: null,
    });
  });
});
