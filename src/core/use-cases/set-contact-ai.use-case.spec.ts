import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, LineUserId } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import {
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { makeSetContactAi } from './set-contact-ai.use-case';
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

describe('SetContactAi', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let settings: FakeSettingsRepository;
  let setAi: ReturnType<typeof makeSetContactAi>;

  beforeEach(() => {
    clock = new FakeClock();
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    settings = new FakeSettingsRepository();
    setAi = makeSetContactAi({ contacts, settings }, config);
  });

  const givenContact = async (repo: FakeContactRepository = contacts): Promise<Contact> =>
    (
      await repo.ensure({
        id: ids.contactId(),
        lineUserId: 'U-customer-1' as LineUserId, // brand: test id
        now: clock.now(),
      })
    ).contact;

  const killSwitch = (on: boolean) => settings.update({ aiEnabled: on });

  it('turns the contact AI on while the kill switch is on and returns the updated row', async () => {
    await killSwitch(true);
    const c = await givenContact();

    const result = await setAi({ contactId: c.id, aiEnabled: true }, ctx);

    expect(result).toEqual({ ok: true, value: await contacts.findById(c.id) });
    expect(result).toMatchObject({ ok: true, value: { aiEnabled: true } });
    expect(result.ok && result.value.updatedSeq > c.updatedSeq).toBe(true);
  });

  it('returns ai.disabled_globally and keeps the value when turning on while the kill switch is off', async () => {
    const c = await givenContact();
    await contacts.setNeedsAdmin(c.id, 'customer_sent_non_text');

    const result = await setAi({ contactId: c.id, aiEnabled: true }, ctx);

    expect(result).toMatchObject({ ok: false, error: { code: 'ai.disabled_globally' } });
    expect(await contacts.findById(c.id)).toMatchObject({ aiEnabled: false, needsAdmin: true });
  });

  it('turns the contact AI off while the kill switch is off', async () => {
    await killSwitch(true);
    const c = await givenContact();
    await contacts.setAiEnabled(c.id, true);
    await killSwitch(false);

    const result = await setAi({ contactId: c.id, aiEnabled: false }, ctx);

    expect(result).toMatchObject({ ok: true, value: { aiEnabled: false } });
  });

  it('keeps the stored per-contact value while the kill switch goes off and on again', async () => {
    await killSwitch(true);
    const c = await givenContact();
    await setAi({ contactId: c.id, aiEnabled: true }, ctx);

    await killSwitch(false);
    expect((await contacts.findById(c.id))?.aiEnabled).toBe(true);
    await killSwitch(true);
    expect((await contacts.findById(c.id))?.aiEnabled).toBe(true);
  });

  it('clears needsAdmin when turning on a chat that waits for an admin', async () => {
    await killSwitch(true);
    const c = await givenContact();
    await contacts.setNeedsAdmin(c.id, 'ai_failed');

    const result = await setAi({ contactId: c.id, aiEnabled: true }, ctx);

    expect(result).toMatchObject({
      ok: true,
      value: { aiEnabled: true, needsAdmin: false, needsAdminReason: null },
    });
  });

  it('leaves needsAdmin alone when turning off', async () => {
    const c = await givenContact();
    await contacts.setNeedsAdmin(c.id, 'ai_failed');

    const result = await setAi({ contactId: c.id, aiEnabled: false }, ctx);

    expect(result).toMatchObject({
      ok: true,
      value: { aiEnabled: false, needsAdmin: true, needsAdminReason: 'ai_failed' },
    });
  });

  it('returns contact.not_found for an unknown contact', async () => {
    await killSwitch(true);

    expect(await setAi({ contactId: ids.contactId(), aiEnabled: true }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'contact.not_found' },
    });
  });

  it('returns contact.not_found when the row disappears before it is read back', async () => {
    const vanishing = new VanishingContacts();
    const c = await givenContact(vanishing);

    const result = await makeSetContactAi({ contacts: vanishing, settings }, config)(
      { contactId: c.id, aiEnabled: false },
      ctx,
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'contact.not_found' } });
  });
});
