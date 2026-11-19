import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, LineUserId } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { FakeClock, FakeContactRepository, FakeIdGenerator } from '@/adapters/fakes';
import { makeMarkContactRead } from './mark-contact-read.use-case';
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

/** Loses the row after the first read, as if it were deleted between two statements. */
class VanishingContacts extends FakeContactRepository {
  private reads = 0;
  override readonly findById: FakeContactRepository['findById'] = (id) =>
    Promise.resolve((this.reads += 1) === 1 ? this.peek(id) : null);
}

describe('MarkContactRead', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let markRead: ReturnType<typeof makeMarkContactRead>;

  beforeEach(() => {
    clock = new FakeClock();
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    markRead = makeMarkContactRead({ contacts }, config);
  });

  const givenContactWithUnread = async (
    unread: number,
    repo: FakeContactRepository = contacts,
  ): Promise<Contact> => {
    const { contact } = await repo.ensure({
      id: ids.contactId(),
      lineUserId: 'U-customer-1' as LineUserId, // brand: test id
      now: clock.now(),
    });
    for (let i = 0; i < unread; i += 1) {
      await repo.recordInbound(contact.id, {
        at: clock.now(),
        preview: { type: 'text', text: `m${String(i)}` },
        replyToken: null,
        replyTokenExpiresAt: null,
      });
    }
    return repo.peek(contact.id) ?? contact;
  };

  it('resets unreadCount 3 to 0 and raises updatedSeq', async () => {
    const c = await givenContactWithUnread(3);
    expect(c.unreadCount).toBe(3);

    const result = await markRead({ contactId: c.id }, ctx);

    expect(result).toEqual({ ok: true, value: await contacts.findById(c.id) });
    expect(result).toMatchObject({ ok: true, value: { unreadCount: 0 } });
    expect(result.ok && result.value.updatedSeq > c.updatedSeq).toBe(true);
  });

  it('is safe to call repeatedly', async () => {
    const c = await givenContactWithUnread(2);

    const first = await markRead({ contactId: c.id }, ctx);
    const second = await markRead({ contactId: c.id }, ctx);

    expect(first).toMatchObject({ ok: true, value: { unreadCount: 0 } });
    expect(second).toMatchObject({ ok: true, value: { unreadCount: 0 } });
  });

  it('returns contact.not_found for an unknown contact', async () => {
    expect(await markRead({ contactId: ids.contactId() }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'contact.not_found' },
    });
  });

  it('returns contact.not_found when the row disappears before it is read back', async () => {
    const vanishing = new VanishingContacts();
    const c = await givenContactWithUnread(1, vanishing);

    const result = await makeMarkContactRead({ contacts: vanishing }, config)(
      { contactId: c.id },
      ctx,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'contact.not_found' } });
  });
});
