import { describe, expect, it } from 'vitest';
import type { ContactId, MessageId } from '@/core/domain';
import type { NewMessage } from '@/core/ports';
import { describeMessageRepositorySuite } from './suites/message-repository.suite';
import { FakeChangeSequence, FakeContactRepository } from './fake-contact-repository';
import { FakeMessageRepository } from './fake-message-repository';

describeMessageRepositorySuite(() => {
  const contacts = new FakeContactRepository();
  return { contacts, messages: new FakeMessageRepository({ contacts }) };
});

const event = (contactId: ContactId, id: string): NewMessage => ({
  id: id as MessageId, // brand: test id
  contactId,
  direction: 'internal',
  author: 'system',
  type: 'event',
  text: null,
  mediaUrl: null,
  previewUrl: null,
  mediaStatus: null,
  stickerPackageId: null,
  stickerId: null,
  otherKind: null,
  eventCode: 'contact.followed',
  lineMessageId: null,
  deliveryStatus: null,
  deliveryError: null,
  retryKey: null,
  createdAt: new Date('2026-11-18T03:00:00.000Z'),
  sentAt: null,
});

describe('FakeMessageRepository', () => {
  const c1 = '00000000-0000-7000-8000-000000000001' as ContactId; // brand: test id

  it('enforces the Contact foreign key when built with contacts', async () => {
    const contacts = new FakeContactRepository();
    const repo = new FakeMessageRepository({ contacts });
    await expect(repo.insertEvent(event(c1, 'm1'))).rejects.toThrow('foreign key');
    await expect(
      repo.insertOutboundIfAbsent({ ...event(c1, 'm1'), direction: 'outbound' }),
    ).rejects.toThrow('foreign key');
  });

  it('rejects a repeated id on insertEvent, like a primary key', async () => {
    const repo = new FakeMessageRepository();
    await repo.insertEvent(event(c1, 'm1'));
    await expect(repo.insertEvent(event(c1, 'm1'))).rejects.toThrow('unique');
  });

  it('uses the given sequence without contacts', async () => {
    const sequence = new FakeChangeSequence();
    sequence.next();
    const repo = new FakeMessageRepository({ sequence });
    expect((await repo.insertEvent(event(c1, 'm1'))).seq).toBe(2n);
    expect(sequence.next()).toBe(3n);
  });
});
