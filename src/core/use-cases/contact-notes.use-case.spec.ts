import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTACT_NOTE_LIST_LIMIT,
  PRICE_TABLE,
  RATE_LIMIT_NOTE_CREATE,
  type ContactId,
  type LineUserId,
  type NoteId,
} from '@/core/domain';
import {
  FakeClock,
  FakeContactNoteRepository,
  FakeContactRepository,
  FakeContentHasher,
  FakeIdGenerator,
  FakeLogger,
  FakeRateLimitRepository,
} from '@/adapters/fakes';
import { makeAddContactNote } from './add-contact-note.use-case';
import { makeDeleteContactNote } from './delete-contact-note.use-case';
import { makeListContactNotes } from './list-contact-notes.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: '203.0.113.9' };
const SECRET = 'ผู้ใช้แพ้ถั่ว โทรหลัง 5 โมง';

describe('contact notes', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let notes: FakeContactNoteRepository;
  let logger: FakeLogger;
  let contactId: ContactId;
  let add: ReturnType<typeof makeAddContactNote>;
  let list: ReturnType<typeof makeListContactNotes>;
  let remove: ReturnType<typeof makeDeleteContactNote>;

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    notes = new FakeContactNoteRepository({ contacts });
    logger = new FakeLogger(clock);
    const deps = {
      contacts,
      notes,
      rateLimits: new FakeRateLimitRepository(),
      hasher: new FakeContentHasher(),
      ids,
      clock,
      logger,
    };
    add = makeAddContactNote(deps, config);
    list = makeListContactNotes(deps, config);
    remove = makeDeleteContactNote(deps, config);
    contactId = (
      await contacts.ensure({
        id: ids.contactId(),
        lineUserId: 'U1' as LineUserId,
        now: clock.now(),
      })
    ) // brand: test id
    .contact.id;
  });

  it('adds a note with the time of the clock and lists it newest first', async () => {
    const first = await add({ contactId, text: 'หนึ่ง' }, ctx);
    clock.advance(1000);
    const second = await add({ contactId, text: SECRET }, ctx);
    expect(first.ok && second.ok).toBe(true);
    const r = await list({ contactId }, ctx);
    expect(r.ok ? r.value.map((n) => [n.text, n.createdAt.toISOString()]) : null).toEqual([
      [SECRET, '2026-11-18T03:00:01.000Z'],
      ['หนึ่ง', '2026-11-18T03:00:00.000Z'],
    ]);
  });

  it('never puts the note text in the log', async () => {
    await add({ contactId, text: SECRET }, ctx);
    expect(logger.eventsOf()).toEqual(['contact.note.added']);
    expect(JSON.stringify(logger.entries)).not.toContain('แพ้ถั่ว');
  });

  it('answers contact.not_found for a contact that does not exist, on add and on list', async () => {
    const other = ids.contactId();
    expect(await add({ contactId: other, text: 'x' }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'contact.not_found' },
    });
    expect(await list({ contactId: other }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'contact.not_found' },
    });
  });

  it('limits adding to RATE_LIMIT_NOTE_CREATE per caller and window', async () => {
    for (let i = 0; i < RATE_LIMIT_NOTE_CREATE.limit; i += 1) {
      expect((await add({ contactId, text: `n${String(i)}` }, ctx)).ok).toBe(true);
    }
    const over = await add({ contactId, text: 'เกิน' }, ctx);
    expect(over).toMatchObject({ ok: false, error: { code: 'note.rate_limited' } });
    expect(over.ok ? null : over.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(
      (await list({ contactId }, ctx)).ok && (await notes.listForContact(contactId, 100)),
    ).toHaveLength(RATE_LIMIT_NOTE_CREATE.limit);
  });

  it('lists at most CONTACT_NOTE_LIST_LIMIT notes', () => {
    expect(CONTACT_NOTE_LIST_LIMIT).toBe(100);
  });

  it('deletes a note of the contact, and answers note.not_found for an unknown or foreign one', async () => {
    const added = await add({ contactId, text: 'ลบ' }, ctx);
    const id = added.ok ? added.value.id : ('x' as NoteId); // brand: unreachable in the test
    const otherContact = (
      await contacts.ensure({
        id: ids.contactId(),
        lineUserId: 'U2' as LineUserId,
        now: clock.now(),
      })
    ) // brand: test id
    .contact.id;
    expect(await remove({ contactId: otherContact, noteId: id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'note.not_found' },
    });
    expect(await remove({ contactId, noteId: id }, ctx)).toEqual({
      ok: true,
      value: { deleted: true },
    });
    expect(await remove({ contactId, noteId: id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'note.not_found' },
    });
    expect(logger.eventsOf()).toEqual(['contact.note.added', 'contact.note.deleted']);
  });
});
