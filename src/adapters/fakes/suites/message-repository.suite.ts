import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ContactId,
  EventCode,
  LineMessageId,
  LineUserId,
  Message,
  MessageId,
  Seq,
} from '@/core/domain';
import type { ContactRepository, MessageRepository, NewMessage } from '@/core/ports';

/** The suite needs contacts as well: Message.contactId is a foreign key and the sequence is shared. */
export interface MessageRepositorySuiteHarness {
  messages: MessageRepository;
  contacts: ContactRepository;
}

const uuid = (prefix: string, n: number): string =>
  `${prefix}-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const contactId = (n: number): ContactId => uuid('00000000', n) as ContactId; // brand: test id
const messageId = (n: number): MessageId => uuid('11111111', n) as MessageId; // brand: test id
const lineMessageId = (n: number): LineMessageId => String(600000 + n) as LineMessageId; // brand: test id
const lineUser = (n: number): LineUserId => `U${n.toString(16).padStart(32, '0')}` as LineUserId; // brand: test id
const at = (second: number): Date => new Date(Date.UTC(2026, 10, 18, 3, 0, second));

const base = (contact: ContactId, n: number): NewMessage => ({
  id: messageId(n),
  contactId: contact,
  direction: 'inbound',
  author: 'customer',
  type: 'text',
  text: `m${String(n)}`,
  mediaUrl: null,
  previewUrl: null,
  mediaStatus: null,
  stickerPackageId: null,
  stickerId: null,
  otherKind: null,
  eventCode: null,
  lineMessageId: null,
  deliveryStatus: null,
  deliveryError: null,
  retryKey: null,
  createdAt: at(n),
  sentAt: null,
});

const inbound = (contact: ContactId, n: number, over: Partial<NewMessage> = {}): NewMessage => ({
  ...base(contact, n),
  lineMessageId: lineMessageId(n),
  ...over,
});

const outbound = (contact: ContactId, n: number, over: Partial<NewMessage> = {}): NewMessage => ({
  ...base(contact, n),
  direction: 'outbound',
  author: 'admin',
  deliveryStatus: 'pending',
  retryKey: messageId(n),
  ...over,
});

const event = (contact: ContactId, n: number): NewMessage => ({
  ...base(contact, n),
  direction: 'internal',
  author: 'system',
  type: 'event',
  text: null,
  eventCode: 'handoff.customer_sent_image',
});

const ids = (ms: Message[]): MessageId[] => ms.map((m) => m.id);

/**
 * Runs every row of the "meaning the real and fake adapters must match" table of
 * MessageRepository (docs/architecture/domain-and-ports.md) against the subject, plus the shared
 * change sequence of data-model.md (Contact.updatedSeq and Message.seq/updatedSeq share one counter).
 *
 * `makeHarness` runs before every test and must return both repositories over empty Message and
 * Contact tables, backed by the same store (one database, or fakes wired with `{ contacts }`).
 * The suite writes only through the ports and compares `Seq` values only relative to each other.
 */
export const describeMessageRepositorySuite = (
  makeHarness: () => MessageRepositorySuiteHarness | Promise<MessageRepositorySuiteHarness>,
): void => {
  describe('MessageRepository contract', () => {
    let repo: MessageRepository;
    let contacts: ContactRepository;
    const A = contactId(1);
    const B = contactId(2);

    beforeEach(async () => {
      ({ messages: repo, contacts } = await makeHarness());
      await contacts.ensure({ id: A, lineUserId: lineUser(1), now: at(0) });
      await contacts.ensure({ id: B, lineUserId: lineUser(2), now: at(0) });
    });

    const get = async (id: MessageId): Promise<Message> => {
      const m = await repo.findById(id);
      if (!m) throw new Error('message missing');
      return m;
    };

    it('findById returns null for an unknown id', async () => {
      expect(await repo.findById(messageId(404))).toBeNull();
    });

    describe('insertInboundIfAbsent', () => {
      it('inserts with seq and updatedSeq equal, and stores every field', async () => {
        const input = inbound(A, 1, {
          type: 'image',
          text: null,
          mediaStatus: 'pending',
        });
        const r = await repo.insertInboundIfAbsent(input);
        expect(r.inserted).toBe(true);
        expect(r.message).toMatchObject(input);
        expect(r.message.updatedSeq).toBe(r.message.seq);
        expect(await repo.findById(input.id)).toEqual(r.message);
      });

      it('returns the existing row for a known lineMessageId', async () => {
        const first = await repo.insertInboundIfAbsent(inbound(A, 1));
        const again = await repo.insertInboundIfAbsent(
          inbound(A, 2, { lineMessageId: lineMessageId(1), text: 'other' }),
        );
        expect(again.inserted).toBe(false);
        expect(again.message).toEqual(first.message);
        expect(await repo.findById(messageId(2))).toBeNull();
      });

      it('gives inserted: true to one of several concurrent callers', async () => {
        const results = await Promise.all(
          [1, 2, 3, 4, 5].map((n) =>
            repo.insertInboundIfAbsent(inbound(A, n, { lineMessageId: lineMessageId(77) })),
          ),
        );
        expect(results.filter((r) => r.inserted)).toHaveLength(1);
        expect(new Set(results.map((r) => r.message.id)).size).toBe(1);
        expect((await repo.countForContact(A)).total).toBe(1);
      });
    });

    describe('insertOutboundIfAbsent', () => {
      it('inserts once per id and returns the existing row on a repeat', async () => {
        const first = await repo.insertOutboundIfAbsent(outbound(A, 1));
        expect(first.inserted).toBe(true);
        expect(first.message).toMatchObject(outbound(A, 1));
        const again = await repo.insertOutboundIfAbsent(outbound(A, 1, { text: 'changed' }));
        expect(again).toEqual({ inserted: false, message: first.message });
      });

      it('gives inserted: true to one of several concurrent callers', async () => {
        const results = await Promise.all(
          Array.from({ length: 5 }, () => repo.insertOutboundIfAbsent(outbound(A, 1))),
        );
        expect(results.filter((r) => r.inserted)).toHaveLength(1);
        expect(new Set(results.map((r) => r.message.seq)).size).toBe(1);
      });
    });

    it('insertEvent stores an event line with a new seq', async () => {
      const m1 = await repo.insertInboundIfAbsent(inbound(A, 1));
      const e = await repo.insertEvent(event(A, 2));
      expect(e).toMatchObject(event(A, 2));
      expect(e.seq).toBeGreaterThan(m1.message.seq);
      expect(e.updatedSeq).toBe(e.seq);
    });

    it('shares one change sequence between Contact and Message', async () => {
      const c1 = await contacts.findById(A);
      const m = (await repo.insertInboundIfAbsent(inbound(A, 1))).message;
      expect(m.seq).toBeGreaterThan(c1?.updatedSeq ?? 0n);
      await contacts.markRead(A);
      const c2 = await contacts.findById(A);
      expect(c2?.updatedSeq).toBeGreaterThan(m.seq);
      const sent = await repo.markFailed(m.id, 'line.push_failed');
      expect(sent.updatedSeq).toBeGreaterThan(c2?.updatedSeq ?? 0n);
    });

    describe('delivery status', () => {
      it('markSent returns the row as sent with a new updatedSeq', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        const sent = await repo.markSent(m.id, at(9));
        expect(sent).toMatchObject({ id: m.id, seq: m.seq, deliveryStatus: 'sent', sentAt: at(9) });
        expect(sent.updatedSeq).toBeGreaterThan(m.updatedSeq);
        expect(await get(m.id)).toEqual(sent);
      });

      it('markFailed returns the row as failed with the code', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        const failed = await repo.markFailed(m.id, 'line.push_failed');
        expect(failed).toMatchObject({
          deliveryStatus: 'failed',
          deliveryError: 'line.push_failed',
        });
        expect(failed.updatedSeq).toBeGreaterThan(m.updatedSeq);
        expect(await get(m.id)).toEqual(failed);
      });

      it('markSent and markFailed throw for a missing row', async () => {
        await expect(repo.markSent(messageId(404), at(1))).rejects.toThrow();
        await expect(repo.markFailed(messageId(404), 'line.push_failed')).rejects.toThrow();
      });

      it('markPendingIfFailed moves failed to pending once and clears the error', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        expect(await repo.markPendingIfFailed(m.id, at(9))).toBe(false);
        const failed = await repo.markFailed(m.id, 'line.push_failed');
        expect(await repo.markPendingIfFailed(m.id, at(9))).toBe(true);
        const pending = await get(m.id);
        expect(pending).toMatchObject({ deliveryStatus: 'pending', deliveryError: null });
        expect(pending.updatedSeq).toBeGreaterThan(failed.updatedSeq);
        expect(await repo.markPendingIfFailed(m.id, at(9))).toBe(false);
        await repo.markSent(m.id, at(5));
        expect(await repo.markPendingIfFailed(m.id, at(9))).toBe(false);
        expect(await repo.markPendingIfFailed(messageId(404), at(9))).toBe(false);
      });

      it('recordFirstPush dates the first push once; retries and later calls keep it', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        expect(m.firstPushAt).toBeNull();
        await repo.recordFirstPush(m.id, at(5));
        expect((await get(m.id)).firstPushAt).toEqual(at(5));
        await repo.markFailed(m.id, 'line.push_failed');
        expect(await repo.markPendingIfFailed(m.id, at(9))).toBe(true);
        await repo.recordFirstPush(m.id, at(9));
        const after = await repo.markSent(m.id, at(10));
        expect(after.firstPushAt).toEqual(at(5));
        // A missing row is not an error: there is nothing to date.
        await repo.recordFirstPush(messageId(404), at(9));
      });

      it('recordFirstPush keeps the value of one concurrent caller and never moves it', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        await Promise.all([1, 2, 3, 4].map((n) => repo.recordFirstPush(m.id, at(n))));
        const stored = (await get(m.id)).firstPushAt;
        expect(stored).not.toBeNull();
        await repo.recordFirstPush(m.id, at(0));
        expect((await get(m.id)).firstPushAt).toEqual(stored);
      });

      it('markPendingIfFailed gives true to one of several concurrent callers', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        await repo.markFailed(m.id, 'line.push_failed');
        const results = await Promise.all(
          Array.from({ length: 5 }, () => repo.markPendingIfFailed(m.id, at(9))),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
      });
    });

    describe('failStuckMedia', () => {
      const media = (contact: ContactId, n: number, over: Partial<NewMessage> = {}) =>
        inbound(contact, n, { type: 'image', text: null, mediaStatus: 'pending', ...over });

      it('fails pending media of that contact created before staleBefore, once, with a new updatedSeq', async () => {
        const old = (await repo.insertInboundIfAbsent(media(A, 1))).message;
        const edge = (await repo.insertInboundIfAbsent(media(A, 10))).message;
        const ready = (await repo.insertInboundIfAbsent(media(A, 2, { mediaStatus: 'ready' })))
          .message;
        const otherContact = (await repo.insertInboundIfAbsent(media(B, 3))).message;

        expect(await repo.failStuckMedia(A, at(10))).toEqual([old.id]);
        const failed = await get(old.id);
        expect(failed.mediaStatus).toBe('failed');
        expect(failed.updatedSeq).toBeGreaterThan(old.updatedSeq);
        // createdAt equal to staleBefore is not older; other statuses and contacts are untouched.
        expect((await get(edge.id)).mediaStatus).toBe('pending');
        expect(await get(ready.id)).toEqual(ready);
        expect(await get(otherContact.id)).toEqual(otherContact);
        expect(await repo.failStuckMedia(A, at(10))).toEqual([]);
        // A late StoreInboundMedia run loses its compare-and-set on pending.
        expect(
          await repo.setMediaReady(old.id, 'https://files.test/o.jpg', 'https://files.test/p.jpg'),
        ).toBe(false);
      });

      it('gives each stuck row to one of several concurrent callers', async () => {
        await repo.insertInboundIfAbsent(media(A, 1));
        await repo.insertInboundIfAbsent(media(A, 2));
        const results = await Promise.all(
          Array.from({ length: 5 }, () => repo.failStuckMedia(A, at(30))),
        );
        expect(results.flat().sort()).toEqual([messageId(1), messageId(2)]);
      });
    });

    describe('failStuckDeliveries', () => {
      it('fails pending outbound rows of that contact whose attempt started before staleBefore', async () => {
        const old = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        const fresh = (await repo.insertOutboundIfAbsent(outbound(A, 20))).message;
        const sent = (await repo.insertOutboundIfAbsent(outbound(A, 2))).message;
        await repo.markSent(sent.id, at(3));
        const otherContact = (await repo.insertOutboundIfAbsent(outbound(B, 4))).message;

        expect(await repo.failStuckDeliveries(A, at(20))).toEqual([old.id]);
        const failed = await get(old.id);
        expect(failed).toMatchObject({
          deliveryStatus: 'failed',
          deliveryError: 'line.send_interrupted',
          retryKey: old.retryKey,
        });
        expect(failed.updatedSeq).toBeGreaterThan(old.updatedSeq);
        expect((await get(fresh.id)).deliveryStatus).toBe('pending');
        expect((await get(sent.id)).deliveryStatus).toBe('sent');
        expect((await get(otherContact.id)).deliveryStatus).toBe('pending');
        expect(await repo.failStuckDeliveries(A, at(20))).toEqual([]);
        // The existing retry works on the recovered row.
        expect(await repo.markPendingIfFailed(old.id, at(40))).toBe(true);
      });

      it('measures a retried row from its last markPendingIfFailed, not from createdAt', async () => {
        const m = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        await repo.markFailed(m.id, 'line.push_failed');
        expect(await repo.markPendingIfFailed(m.id, at(50))).toBe(true);

        expect(await repo.failStuckDeliveries(A, at(50))).toEqual([]);
        expect((await get(m.id)).deliveryStatus).toBe('pending');
        expect(await repo.failStuckDeliveries(A, at(51))).toEqual([m.id]);
      });

      it('gives each stuck row to one of several concurrent callers', async () => {
        await repo.insertOutboundIfAbsent(outbound(A, 1));
        await repo.insertOutboundIfAbsent(outbound(A, 2));
        const results = await Promise.all(
          Array.from({ length: 5 }, () => repo.failStuckDeliveries(A, at(30))),
        );
        expect(results.flat().sort()).toEqual([messageId(1), messageId(2)]);
      });
    });

    it('setMediaReady and setMediaStatus set the media fields with a new updatedSeq', async () => {
      const m = (
        await repo.insertInboundIfAbsent(
          inbound(A, 1, { type: 'image', text: null, mediaStatus: 'pending' }),
        )
      ).message;
      expect(
        await repo.setMediaReady(m.id, 'https://files.test/o.jpg', 'https://files.test/p.jpg'),
      ).toBe(true);
      const ready = await get(m.id);
      expect(ready).toMatchObject({
        mediaStatus: 'ready',
        mediaUrl: 'https://files.test/o.jpg',
        previewUrl: 'https://files.test/p.jpg',
      });
      expect(ready.updatedSeq).toBeGreaterThan(m.updatedSeq);

      const v = (
        await repo.insertInboundIfAbsent(
          inbound(A, 2, { type: 'video', text: null, mediaStatus: 'pending' }),
        )
      ).message;
      expect(await repo.setMediaStatus(v.id, 'too_large')).toBe(true);
      const tooLarge = await get(v.id);
      expect(tooLarge.mediaStatus).toBe('too_large');
      expect(tooLarge.updatedSeq).toBeGreaterThan(v.updatedSeq);

      const f = (
        await repo.insertInboundIfAbsent(
          inbound(A, 3, { type: 'image', text: null, mediaStatus: 'pending' }),
        )
      ).message;
      expect(await repo.setMediaStatus(f.id, 'failed')).toBe(true);
      expect((await get(f.id)).mediaStatus).toBe('failed');
    });

    it('setMediaReady and setMediaStatus change only pending media and return false otherwise', async () => {
      const m = (
        await repo.insertInboundIfAbsent(
          inbound(A, 1, { type: 'image', text: null, mediaStatus: 'pending' }),
        )
      ).message;
      await repo.setMediaReady(m.id, 'https://files.test/o.jpg', 'https://files.test/o.jpg');
      const ready = await get(m.id);

      expect(await repo.setMediaStatus(m.id, 'failed')).toBe(false);
      expect(
        await repo.setMediaReady(m.id, 'https://files.test/x.jpg', 'https://files.test/x.jpg'),
      ).toBe(false);
      expect(await get(m.id)).toEqual(ready);

      const failed = (
        await repo.insertInboundIfAbsent(
          inbound(A, 2, { type: 'image', text: null, mediaStatus: 'failed' }),
        )
      ).message;
      expect(
        await repo.setMediaReady(failed.id, 'https://files.test/y.jpg', 'https://files.test/y.jpg'),
      ).toBe(false);
      expect(await get(failed.id)).toEqual(failed);
      expect(await repo.setMediaStatus(messageId(404), 'failed')).toBe(false);
    });

    it('setMediaReady and setMediaStatus give true to one of several concurrent callers', async () => {
      const m = (
        await repo.insertInboundIfAbsent(
          inbound(A, 1, { type: 'video', text: null, mediaStatus: 'pending' }),
        )
      ).message;
      const results = await Promise.all([
        repo.setMediaReady(m.id, 'https://files.test/a.mp4', 'https://files.test/a.jpg'),
        repo.setMediaReady(m.id, 'https://files.test/b.mp4', 'https://files.test/b.jpg'),
        repo.setMediaStatus(m.id, 'failed'),
        repo.setMediaStatus(m.id, 'too_large'),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('latestInbound returns the newest inbound by seq for that contact only', async () => {
      expect(await repo.latestInbound(A)).toBeNull();
      // createdAt order differs from seq order on purpose: seq decides.
      await repo.insertInboundIfAbsent(inbound(A, 5));
      await repo.insertInboundIfAbsent(inbound(A, 2));
      await repo.insertOutboundIfAbsent(outbound(A, 3));
      await repo.insertEvent(event(A, 4));
      await repo.insertInboundIfAbsent(inbound(B, 6));
      expect((await repo.latestInbound(A))?.id).toBe(messageId(2));
    });

    it('recentForAi returns the latest non-event messages, oldest first', async () => {
      await repo.insertInboundIfAbsent(inbound(A, 1));
      await repo.insertOutboundIfAbsent(outbound(A, 2, { author: 'ai' }));
      await repo.insertEvent(event(A, 3));
      await repo.insertInboundIfAbsent(inbound(A, 4));
      await repo.insertInboundIfAbsent(inbound(B, 5));
      expect(ids(await repo.recentForAi(A, 2))).toEqual([messageId(2), messageId(4)]);
      expect(ids(await repo.recentForAi(A, 10))).toEqual([1, 2, 4].map(messageId));
      expect(await repo.recentForAi(contactId(3), 10)).toEqual([]);
    });

    describe('history pages', () => {
      const seedFive = async () => {
        await repo.insertInboundIfAbsent(inbound(A, 1));
        await repo.insertOutboundIfAbsent(outbound(A, 2));
        await repo.insertEvent(event(A, 3));
        await repo.insertInboundIfAbsent(inbound(B, 9));
        await repo.insertInboundIfAbsent(inbound(A, 4));
        await repo.insertInboundIfAbsent(inbound(A, 5));
      };

      it('listLatest returns the newest page oldest first, including events', async () => {
        await seedFive();
        const page = await repo.listLatest(A, 3);
        expect(ids(page.messages)).toEqual([3, 4, 5].map(messageId));
        expect(page.hasOlder).toBe(true);
        const all = await repo.listLatest(A, 5);
        expect(ids(all.messages)).toEqual([1, 2, 3, 4, 5].map(messageId));
        expect(all.hasOlder).toBe(false);
        expect(await repo.listLatest(contactId(3), 5)).toEqual({ messages: [], hasOlder: false });
      });

      it('listBefore returns the page before a seq, oldest first', async () => {
        await seedFive();
        const latest = await repo.listLatest(A, 2);
        const cursor = latest.messages[0]?.seq;
        if (cursor === undefined) throw new Error('expected a page');
        const older = await repo.listBefore(A, cursor, 2);
        expect(ids(older.messages)).toEqual([2, 3].map(messageId));
        expect(older.hasOlder).toBe(true);
        const oldest = await repo.listBefore(A, cursor, 3);
        expect(ids(oldest.messages)).toEqual([1, 2, 3].map(messageId));
        expect(oldest.hasOlder).toBe(false);
      });
    });

    describe('polling by updatedSeq', () => {
      it('listChangedAfter returns a changed row even when its seq is below the cursor', async () => {
        const old = (await repo.insertOutboundIfAbsent(outbound(A, 1))).message;
        await repo.insertInboundIfAbsent(inbound(A, 2));
        await repo.insertInboundIfAbsent(inbound(B, 3));
        const cursor = await repo.maxUpdatedSeq(A);

        const sent = await repo.markSent(old.id, at(10));
        const fresh = (await repo.insertInboundIfAbsent(inbound(A, 4))).message;

        expect(old.seq).toBeLessThan(cursor);
        const r = await repo.listChangedAfter(A, cursor, 10);
        expect(ids(r.messages)).toEqual([old.id, fresh.id]);
        expect(r.messages[0]).toEqual(sent);
        expect(r.hasMore).toBe(false);
        expect(await repo.maxUpdatedSeq(A)).toBe(fresh.updatedSeq);
      });

      it('listChangedAfter orders by updatedSeq, limits and reports hasMore', async () => {
        await repo.insertInboundIfAbsent(
          inbound(A, 1, { type: 'image', text: null, mediaStatus: 'pending' }),
        );
        await repo.insertInboundIfAbsent(inbound(A, 2));
        await repo.insertInboundIfAbsent(inbound(A, 3));
        await repo.setMediaStatus(messageId(1), 'failed');
        const all = await repo.listChangedAfter(A, 0n as Seq, 10); // brand: the lowest cursor
        expect(ids(all.messages)).toEqual([2, 3, 1].map(messageId));
        const page = await repo.listChangedAfter(A, 0n as Seq, 2); // brand: the lowest cursor
        expect(ids(page.messages)).toEqual([2, 3].map(messageId));
        expect(page.hasMore).toBe(true);
        expect((await repo.listChangedAfter(B, 0n as Seq, 10)).messages).toEqual([]); // brand: the lowest cursor
      });

      it('maxUpdatedSeq is 0 when the contact has no message', async () => {
        await repo.insertInboundIfAbsent(inbound(B, 1));
        expect(await repo.maxUpdatedSeq(A)).toBe(0n);
      });
    });

    it('countForContact counts non-event messages and the ones by AI', async () => {
      expect(await repo.countForContact(A)).toEqual({ total: 0, byAi: 0 });
      await repo.insertInboundIfAbsent(inbound(A, 1));
      await repo.insertOutboundIfAbsent(outbound(A, 2, { author: 'ai' }));
      await repo.insertOutboundIfAbsent(outbound(A, 3, { author: 'ai' }));
      await repo.insertOutboundIfAbsent(outbound(A, 4));
      await repo.insertEvent(event(A, 5));
      await repo.insertInboundIfAbsent(inbound(B, 6));
      expect(await repo.countForContact(A)).toEqual({ total: 4, byAi: 2 });
    });

    describe('countEventsByCode', () => {
      // One Bangkok day: 2026-11-18 00:00 to 2026-11-19 00:00 local time, in UTC.
      const range = {
        from: new Date('2026-11-17T17:00:00.000Z'),
        to: new Date('2026-11-18T17:00:00.000Z'),
      };
      const line = (contact: ContactId, n: number, code: EventCode, iso: string): NewMessage => ({
        ...event(contact, n),
        eventCode: code,
        createdAt: new Date(iso),
      });

      it('is empty with no event line', async () => {
        await repo.insertInboundIfAbsent(inbound(A, 1));
        expect(await repo.countEventsByCode(range)).toEqual({});
      });

      it('counts event lines of every contact by code in [from, to)', async () => {
        await repo.insertEvent(line(A, 1, 'handoff.ai_failed', '2026-11-17T17:00:00.000Z'));
        await repo.insertEvent(line(B, 2, 'handoff.ai_failed', '2026-11-18T10:00:00.000Z'));
        await repo.insertEvent(line(A, 3, 'handoff.ai_timeout', '2026-11-18T16:59:59.999Z'));
        await repo.insertEvent(line(B, 4, 'guard.blocked', '2026-11-18T05:00:00.000Z'));
        // Outside: the end is exclusive, and the previous Bangkok day.
        await repo.insertEvent(line(A, 5, 'handoff.ai_failed', '2026-11-18T17:00:00.000Z'));
        await repo.insertEvent(line(A, 6, 'contact.followed', '2026-11-17T16:59:59.999Z'));
        // Not an event line.
        await repo.insertInboundIfAbsent(
          inbound(A, 7, { createdAt: new Date('2026-11-18T05:00:00.000Z') }),
        );
        expect(await repo.countEventsByCode(range)).toEqual({
          'handoff.ai_failed': 2,
          'handoff.ai_timeout': 1,
          'guard.blocked': 1,
        });
      });
    });
  });
};
