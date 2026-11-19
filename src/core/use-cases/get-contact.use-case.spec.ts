import { beforeEach, describe, expect, it } from 'vitest';
import type { ContactId, LineUserId, MessageId } from '@/core/domain';
import {
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeMessageRepository,
} from '@/adapters/fakes';
import { makeGetContact } from './get-contact.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const ctx: RequestContext = { requestId: 'req-test', clientIp: null };

describe('GetContact', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let getContact: ReturnType<typeof makeGetContact>;

  const base = (contactId: ContactId, id: MessageId) => ({
    id,
    contactId,
    mediaUrl: null,
    previewUrl: null,
    mediaStatus: null,
    stickerPackageId: null,
    stickerId: null,
    otherKind: null,
    lineMessageId: null,
    createdAt: clock.now(),
    sentAt: null,
  });

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    getContact = makeGetContact({ contacts, messages }, {} as UseCaseConfig); // brand: config unused
  });

  it('returns the contact with its follow date, message count and AI reply count, without event lines', async () => {
    const { contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: 'U-1' as LineUserId, // brand: test id
      now: clock.now(),
    });
    const followedAt = new Date('2026-11-01T00:00:00.000Z');
    await contacts.setFollowStatus(contact.id, 'following', followedAt);
    const id = contact.id;
    await messages.insertOutboundIfAbsent({
      ...base(id, ids.messageId()),
      direction: 'outbound',
      author: 'admin',
      type: 'text',
      text: 'a',
      eventCode: null,
      deliveryStatus: 'sent',
      deliveryError: null,
      retryKey: null,
    });
    await messages.insertOutboundIfAbsent({
      ...base(id, ids.messageId()),
      direction: 'outbound',
      author: 'ai',
      type: 'text',
      text: 'b',
      eventCode: null,
      deliveryStatus: 'sent',
      deliveryError: null,
      retryKey: null,
    });
    await messages.insertEvent({
      ...base(id, ids.messageId()),
      direction: 'internal',
      author: 'system',
      type: 'event',
      text: null,
      eventCode: 'handoff.ai_other',
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
    });

    const r = await getContact({ contactId: id }, ctx);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contact.id).toBe(id);
    expect(r.value.contact.followedAt).toEqual(followedAt);
    expect(r.value.stats).toEqual({ messageCount: 2, aiMessageCount: 1 });
  });

  it('returns contact.not_found for an unknown id', async () => {
    const r = await getContact({ contactId: ids.contactId() }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'contact.not_found' } });
  });
});
