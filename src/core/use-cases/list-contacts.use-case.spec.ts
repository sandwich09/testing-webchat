import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTACT_PAGE_LIMIT,
  POLL_PAGE_LIMIT,
  type Contact,
  type LineUserId,
  type MessageType,
  type Seq,
} from '@/core/domain';
import {
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { makeListContacts, type ListContactsOutput } from './list-contacts.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const STUCK_MS = 120_000;
const ctx: RequestContext = { requestId: 'req-test', clientIp: null };

describe('ListContacts', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let settings: FakeSettingsRepository;
  let logger: FakeLogger;
  let listContacts: ReturnType<typeof makeListContacts>;
  let n = 0;

  const config = { aiStuckAfterMs: STUCK_MS } as UseCaseConfig; // brand: only this field is read

  const addContact = async (
    name: string | null,
    opts: { unread?: boolean; at?: Date; type?: MessageType } = {},
  ): Promise<Contact> => {
    n += 1;
    const { contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: `U-${String(n)}` as LineUserId, // brand: test id
      now: clock.now(),
    });
    if (name !== null)
      await contacts.updateProfile(contact.id, { displayName: name, pictureUrl: null });
    if (opts.unread === true || opts.at) {
      await contacts.recordInbound(contact.id, {
        at: opts.at ?? clock.now(),
        preview: { type: 'text', text: 'hi' },
        replyToken: null,
        replyTokenExpiresAt: null,
      });
      if (opts.unread !== true) await contacts.markRead(contact.id);
    }
    return (await contacts.findById(contact.id)) as Contact; // test row exists
  };

  const page = async (
    over: {
      filter?: 'all' | 'unread' | 'needs_admin';
      search?: string | null;
      before?: ListContactsOutput['next'];
    } = {},
  ): Promise<ListContactsOutput> => {
    const r = await listContacts(
      {
        mode: 'page',
        filter: over.filter ?? 'all',
        search: over.search ?? null,
        before: over.before ?? null,
      },
      ctx,
    );
    if (!r.ok) throw new Error('unexpected error');
    return r.value;
  };

  const eventsOf = async (c: Contact) =>
    (await messages.listLatest(c.id, 50)).messages.filter((m) => m.type === 'event');

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    settings = new FakeSettingsRepository();
    logger = new FakeLogger(clock);
    n = 0;
    listContacts = makeListContacts({ contacts, messages, settings, ids, clock, logger }, config);
  });

  describe('stuck AI recovery', () => {
    it('hands over a contact stuck longer than the limit with one ai_timeout event line', async () => {
      const c = await addContact('A');
      await contacts.tryAcquireAiLock(c.id, clock.now());
      clock.advance(STUCK_MS + 1);

      await page();

      const after = (await contacts.findById(c.id)) as Contact;
      expect(after.aiState).toBe('idle');
      expect(after.needsAdmin).toBe(true);
      expect(after.needsAdminReason).toBe('ai_timeout');
      const lines = await eventsOf(c);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        eventCode: 'handoff.ai_timeout',
        author: 'system',
        direction: 'internal',
        createdAt: clock.now(),
      });
      expect(logger.entries).toEqual([
        expect.objectContaining({ event: 'ai.reply.stuck_recovered', count: 1 }),
      ]);
    });

    it('does not touch a contact whose job is not yet overdue, or one that is idle', async () => {
      const busy = await addContact('Busy');
      const idle = await addContact('Idle');
      await contacts.tryAcquireAiLock(busy.id, clock.now());
      clock.advance(STUCK_MS - 1);
      const seqBefore = await contacts.maxUpdatedSeq();

      await page();

      expect(await contacts.maxUpdatedSeq()).toBe(seqBefore);
      expect(((await contacts.findById(busy.id)) as Contact).aiState).toBe('replying');
      expect(((await contacts.findById(idle.id)) as Contact).needsAdmin).toBe(false);
      expect(await eventsOf(busy)).toHaveLength(0);
      expect(await eventsOf(idle)).toHaveLength(0);
      expect(logger.entries).toHaveLength(0);
    });

    it('recovers once and writes one event line per contact when two calls run concurrently', async () => {
      const a = await addContact('A');
      const b = await addContact('B');
      await contacts.tryAcquireAiLock(a.id, clock.now());
      await contacts.tryAcquireAiLock(b.id, clock.now());
      clock.advance(STUCK_MS + 1);

      await Promise.all([page(), page()]);

      expect(await eventsOf(a)).toHaveLength(1);
      expect(await eventsOf(b)).toHaveLength(1);
      expect(logger.entries.filter((e) => e.event === 'ai.reply.stuck_recovered')).toHaveLength(1);
    });

    it('also recovers in changes mode', async () => {
      const c = await addContact('A');
      await contacts.tryAcquireAiLock(c.id, clock.now());
      clock.advance(STUCK_MS + 1);

      const r = await listContacts({ mode: 'changes', afterUpdatedSeq: 0n as Seq }, ctx); // brand: test cursor
      expect(r.ok && r.value.contacts[0]?.needsAdminReason).toBe('ai_timeout');
      expect(await eventsOf(c)).toHaveLength(1);
    });
  });

  describe('page mode', () => {
    it('filters unread and needs_admin', async () => {
      const unread = await addContact('U', { unread: true });
      const admin = await addContact('N');
      await contacts.setNeedsAdmin(admin.id, 'ai_other');
      await addContact('Plain');

      expect((await page({ filter: 'unread' })).contacts.map((c) => c.id)).toEqual([unread.id]);
      expect((await page({ filter: 'needs_admin' })).contacts.map((c) => c.id)).toEqual([admin.id]);
      expect((await page()).contacts).toHaveLength(3);
    });

    it('searches by name ignoring case', async () => {
      const m = await addContact('Mali Tester');
      await addContact('Somchai');

      const r = await page({ search: 'mALI' });
      expect(r.contacts.map((c) => c.id)).toEqual([m.id]);
    });

    it('sorts newest first and pages with the cursor without skipping or repeating equal sortAt', async () => {
      const same = new Date('2026-11-18T02:00:00.000Z');
      const created: Contact[] = [];
      for (let i = 0; i < CONTACT_PAGE_LIMIT + 5; i += 1) {
        created.push(await addContact(`C${String(i)}`, { at: same }));
      }
      const newest = await addContact('Newest', { at: new Date('2026-11-18T02:30:00.000Z') });

      const first = await page();
      expect(first.contacts).toHaveLength(CONTACT_PAGE_LIMIT);
      expect(first.contacts[0]?.id).toBe(newest.id);
      expect(first.hasMore).toBe(true);
      expect(first.next).not.toBeNull();

      const second = await page({ before: first.next });
      expect(second.hasMore).toBe(false);
      expect(second.next).toBeNull();

      const all = [...first.contacts, ...second.contacts].map((c) => c.id);
      expect(new Set(all).size).toBe(all.length);
      expect(all).toHaveLength(created.length + 1);
    });

    it('returns per-filter counts and lineConfigured', async () => {
      await addContact('U', { unread: true });
      const a = await addContact('N');
      await contacts.setNeedsAdmin(a.id, 'ai_other');
      await settings.saveLineCredentials(
        { channelSecretEnc: 's', channelAccessTokenEnc: 't' },
        { botName: 'Bot', basicId: '@bot' },
      );

      const r = await page({ filter: 'unread' });
      expect(r.counts).toEqual({ all: 2, unread: 1, needsAdmin: 1 });
      expect(r.lineConfigured).toBe(true);
    });

    it('reads highWater before listing', async () => {
      const first = await addContact('A');
      const order: string[] = [];
      const maxUpdatedSeq = contacts.maxUpdatedSeq.bind(contacts);
      const list = contacts.list.bind(contacts);
      const spy = new Proxy(contacts, {
        get: (target, prop) => {
          if (prop === 'maxUpdatedSeq')
            return async () => {
              order.push('max');
              const v = await maxUpdatedSeq();
              // a row changes right after the mark is read
              await contacts.markRead(first.id);
              return v;
            };
          if (prop === 'list')
            return (q: Parameters<typeof list>[0]) => {
              order.push('list');
              return list(q);
            };
          return Reflect.get(target, prop) as unknown;
        },
      });
      const uc = makeListContacts(
        { contacts: spy, messages, settings, ids, clock, logger },
        config,
      );

      const r = await uc({ mode: 'page', filter: 'all', search: null, before: null }, ctx);

      expect(order).toEqual(['max', 'list']);
      expect(r.ok && r.value.highWater).toBeLessThan(await contacts.maxUpdatedSeq());
    });
  });

  describe('changes mode', () => {
    it('returns only rows changed after the cursor, in updatedSeq order, with next null', async () => {
      const a = await addContact('A');
      const b = await addContact('B');
      const cursor = await contacts.maxUpdatedSeq();
      await contacts.markRead(b.id);
      await contacts.markRead(a.id);

      const r = await listContacts({ mode: 'changes', afterUpdatedSeq: cursor }, ctx);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.contacts.map((c) => c.id)).toEqual([b.id, a.id]);
      expect(r.value.next).toBeNull();
      expect(r.value.hasMore).toBe(false);
      expect(r.value.highWater).toBe(await contacts.maxUpdatedSeq());
      expect(r.value.counts.all).toBe(2);
    });

    it('returns the same cursor when nothing changed', async () => {
      await addContact('A');
      const cursor = await contacts.maxUpdatedSeq();

      const r = await listContacts({ mode: 'changes', afterUpdatedSeq: cursor }, ctx);
      expect(r.ok && r.value).toMatchObject({
        contacts: [],
        hasMore: false,
        highWater: cursor,
        next: null,
      });
    });

    it('limits to POLL_PAGE_LIMIT rows with hasMore and a cursor at the last row', async () => {
      for (let i = 0; i < POLL_PAGE_LIMIT + 1; i += 1) await addContact(null);

      const r = await listContacts({ mode: 'changes', afterUpdatedSeq: 0n as Seq }, ctx); // brand: test cursor
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.contacts).toHaveLength(POLL_PAGE_LIMIT);
      expect(r.value.hasMore).toBe(true);
      expect(r.value.highWater).toBe(r.value.contacts.at(-1)?.updatedSeq);
    });
  });
});
