import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, LineUserId } from '@/core/domain';
import {
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
} from '@/adapters/fakes';
import { makeRaiseHandoff, type RaiseHandoff } from './raise-handoff';

describe('raiseHandoff', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let logger: FakeLogger;
  let raise: RaiseHandoff;
  let contact: Contact;

  const reload = async (): Promise<Contact> => {
    const c = await contacts.findById(contact.id);
    if (c === null) throw new Error('contact missing');
    return c;
  };

  const events = async () =>
    (await messages.listLatest(contact.id, 50)).messages.filter((m) => m.type === 'event');

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    logger = new FakeLogger(clock);
    raise = makeRaiseHandoff({ contacts, messages, ids, clock, logger });
    ({ contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: 'U-1' as LineUserId, // brand: test id
      now: clock.now(),
    }));
  });

  it('sets needsAdmin, adds one handoff event line and logs the reason', async () => {
    await raise(contact, 'customer_sent_image');

    const after = await reload();
    expect(after.needsAdmin).toBe(true);
    expect(after.needsAdminReason).toBe('customer_sent_image');
    const lines = await events();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      contactId: contact.id,
      direction: 'internal',
      author: 'system',
      type: 'event',
      eventCode: 'handoff.customer_sent_image',
      text: null,
      deliveryStatus: null,
      retryKey: null,
      createdAt: clock.now(),
    });
    expect(logger.entries).toEqual([
      expect.objectContaining({
        level: 'info',
        event: 'ai.reply.handoff',
        contactId: contact.id,
        reason: 'customer_sent_image',
      }),
    ]);
  });

  it('does nothing when the same reason is already raised', async () => {
    await raise(contact, 'budget_reached');
    const raised = await reload();

    await raise(raised, 'budget_reached');
    await raise(raised, 'budget_reached');

    expect(await events()).toHaveLength(1);
    expect(logger.eventsOf()).toEqual(['ai.reply.handoff']);
  });

  it('adds a new line and replaces the reason when the reason differs', async () => {
    await raise(contact, 'budget_reached');
    await raise(await reload(), 'ai_failed');

    expect((await reload()).needsAdminReason).toBe('ai_failed');
    expect((await events()).map((m) => m.eventCode)).toEqual([
      'handoff.budget_reached',
      'handoff.ai_failed',
    ]);
  });

  it('raises again after the admin cleared needsAdmin, even with the same reason', async () => {
    await raise(contact, 'ai_not_in_knowledge');
    await contacts.clearNeedsAdmin(contact.id);

    await raise(await reload(), 'ai_not_in_knowledge');

    expect(await events()).toHaveLength(2);
    expect((await reload()).needsAdmin).toBe(true);
  });
});
