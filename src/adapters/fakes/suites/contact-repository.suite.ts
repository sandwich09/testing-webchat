import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, ContactId, LineUserId, Seq } from '@/core/domain';
import type { ContactRepository } from '@/core/ports';

// Ids are valid UUIDs (the column is uuid) and sort in the same order as `n`.
const contactId = (n: number): ContactId =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}` as ContactId; // brand: test id
const lineUser = (n: number): LineUserId => `U${n.toString(16).padStart(32, '0')}` as LineUserId; // brand: test id
const at = (iso: string): Date => new Date(iso);
const T0 = '2026-11-18T03:00:00.000Z';
const text = (t: string) => ({ type: 'text' as const, text: t });

/**
 * Runs every row of the "meaning the real and fake adapters must match" table of
 * ContactRepository (docs/architecture/domain-and-ports.md) against the subject.
 *
 * `makeSubject` runs before every test and must return a repository over an empty Contact table
 * (a Postgres harness truncates Contact and the tables that reference it first). The suite reads
 * and writes only through the port, and compares `Seq` values only relative to each other.
 */
export const describeContactRepositorySuite = (
  makeSubject: () => ContactRepository | Promise<ContactRepository>,
): void => {
  describe('ContactRepository contract', () => {
    let repo: ContactRepository;

    beforeEach(async () => {
      repo = await makeSubject();
    });

    const create = async (n: number, now = T0): Promise<Contact> =>
      (await repo.ensure({ id: contactId(n), lineUserId: lineUser(n), now: at(now) })).contact;

    const get = async (id: ContactId): Promise<Contact> => {
      const c = await repo.findById(id);
      if (!c) throw new Error('contact missing');
      return c;
    };

    describe('ensure', () => {
      it('creates a following contact with AI off and returns created: true', async () => {
        const r = await repo.ensure({ id: contactId(1), lineUserId: lineUser(1), now: at(T0) });
        expect(r.created).toBe(true);
        expect(r.contact).toMatchObject({
          id: contactId(1),
          lineUserId: lineUser(1),
          displayName: null,
          pictureUrl: null,
          followStatus: 'following',
          followedAt: null,
          aiEnabled: false,
          needsAdmin: false,
          needsAdminReason: null,
          aiState: 'idle',
          aiStateAt: null,
          unreadCount: 0,
          lastMessageAt: null,
          lastMessagePreview: null,
          lastMessageBy: null,
          lastMessageType: null,
          replyToken: null,
          replyTokenExpiresAt: null,
          createdAt: at(T0),
        });
        expect(await repo.findById(contactId(1))).toEqual(r.contact);
      });

      it('returns the existing row with created: false for a known lineUserId', async () => {
        const first = await create(1);
        const again = await repo.ensure({
          id: contactId(2),
          lineUserId: lineUser(1),
          now: at('2026-11-18T04:00:00.000Z'),
        });
        expect(again.created).toBe(false);
        expect(again.contact.id).toBe(first.id);
        expect(again.contact.createdAt).toEqual(at(T0));
        expect(await repo.findById(contactId(2))).toBeNull();
      });

      it('gives one row and one created: true when called concurrently', async () => {
        const results = await Promise.all(
          [1, 2, 3, 4, 5].map((n) =>
            repo.ensure({ id: contactId(n), lineUserId: lineUser(9), now: at(T0) }),
          ),
        );
        expect(results.filter((r) => r.created)).toHaveLength(1);
        expect(new Set(results.map((r) => r.contact.id)).size).toBe(1);
        expect((await repo.countByFilter()).all).toBe(1);
      });
    });

    it('findById returns null for an unknown id', async () => {
      expect(await repo.findById(contactId(404))).toBeNull();
    });

    it('updateProfile sets the display name and picture', async () => {
      await create(1);
      await repo.updateProfile(contactId(1), {
        displayName: 'คุณส้ม',
        pictureUrl: 'https://profile.line-scdn.net/x',
      });
      expect(await get(contactId(1))).toMatchObject({
        displayName: 'คุณส้ม',
        pictureUrl: 'https://profile.line-scdn.net/x',
      });
      await repo.updateProfile(contactId(1), { displayName: null, pictureUrl: null });
      expect(await get(contactId(1))).toMatchObject({ displayName: null, pictureUrl: null });
    });

    describe('setFollowStatus', () => {
      it('following sets followedAt', async () => {
        await create(1);
        await repo.setFollowStatus(contactId(1), 'following', at('2026-11-18T05:00:00.000Z'));
        expect(await get(contactId(1))).toMatchObject({
          followStatus: 'following',
          followedAt: at('2026-11-18T05:00:00.000Z'),
        });
      });

      it('unfollowed clears the reply token and keeps followedAt', async () => {
        await create(1);
        await repo.setFollowStatus(contactId(1), 'following', at('2026-11-18T05:00:00.000Z'));
        await repo.recordInbound(contactId(1), {
          at: at('2026-11-18T05:01:00.000Z'),
          preview: text('hi'),
          replyToken: 'rt-1',
          replyTokenExpiresAt: at('2026-11-18T05:01:50.000Z'),
        });
        await repo.setFollowStatus(contactId(1), 'unfollowed', at('2026-11-18T06:00:00.000Z'));
        expect(await get(contactId(1))).toMatchObject({
          followStatus: 'unfollowed',
          followedAt: at('2026-11-18T05:00:00.000Z'),
          replyToken: null,
          replyTokenExpiresAt: null,
        });
      });
    });

    describe('recordInbound', () => {
      it('adds one unread, sets the last message and the reply token', async () => {
        await create(1);
        await repo.recordInbound(contactId(1), {
          at: at('2026-11-18T05:00:00.000Z'),
          preview: text('สวัสดี'),
          replyToken: 'rt-1',
          replyTokenExpiresAt: at('2026-11-18T05:00:50.000Z'),
        });
        expect(await get(contactId(1))).toMatchObject({
          unreadCount: 1,
          lastMessageAt: at('2026-11-18T05:00:00.000Z'),
          lastMessagePreview: 'สวัสดี',
          lastMessageType: 'text',
          lastMessageBy: 'customer',
          replyToken: 'rt-1',
          replyTokenExpiresAt: at('2026-11-18T05:00:50.000Z'),
        });
      });

      it('never moves the last message backwards but still counts the unread', async () => {
        await create(1);
        await repo.recordInbound(contactId(1), {
          at: at('2026-11-18T05:00:00.000Z'),
          preview: text('newer'),
          replyToken: null,
          replyTokenExpiresAt: null,
        });
        await repo.recordInbound(contactId(1), {
          at: at('2026-11-18T04:59:00.000Z'),
          preview: { type: 'image', text: null },
          replyToken: null,
          replyTokenExpiresAt: null,
        });
        expect(await get(contactId(1))).toMatchObject({
          unreadCount: 2,
          lastMessageAt: at('2026-11-18T05:00:00.000Z'),
          lastMessagePreview: 'newer',
          lastMessageType: 'text',
          lastMessageBy: 'customer',
        });
      });

      it('replaces the reply token only when the new expiresAt is later', async () => {
        await create(1);
        const inbound = (token: string | null, expires: string | null) =>
          repo.recordInbound(contactId(1), {
            at: at('2026-11-18T05:00:00.000Z'),
            preview: text('x'),
            replyToken: token,
            replyTokenExpiresAt: expires === null ? null : at(expires),
          });
        await inbound('rt-new', '2026-11-18T05:00:50.000Z');
        await inbound('rt-old', '2026-11-18T05:00:40.000Z');
        await inbound(null, null);
        expect(await get(contactId(1))).toMatchObject({
          replyToken: 'rt-new',
          replyTokenExpiresAt: at('2026-11-18T05:00:50.000Z'),
        });
        await inbound('rt-newest', '2026-11-18T05:01:00.000Z');
        expect((await get(contactId(1))).replyToken).toBe('rt-newest');
      });
    });

    it('recordOutbound sets the preview and its author, not the sort time or unread', async () => {
      await create(1);
      await repo.recordInbound(contactId(1), {
        at: at('2026-11-18T05:00:00.000Z'),
        preview: text('q'),
        replyToken: null,
        replyTokenExpiresAt: null,
      });
      await repo.recordOutbound(contactId(1), { preview: text('ตอบแล้วค่ะ'), by: 'ai' });
      expect(await get(contactId(1))).toMatchObject({
        unreadCount: 1,
        lastMessageAt: at('2026-11-18T05:00:00.000Z'),
        lastMessagePreview: 'ตอบแล้วค่ะ',
        lastMessageType: 'text',
        lastMessageBy: 'ai',
      });
      await repo.recordOutbound(contactId(1), {
        preview: { type: 'video', text: null },
        by: 'admin',
      });
      expect(await get(contactId(1))).toMatchObject({
        lastMessagePreview: null,
        lastMessageType: 'video',
        lastMessageBy: 'admin',
      });
    });

    describe('consumeReplyToken', () => {
      const withToken = async () => {
        await create(1);
        await repo.recordInbound(contactId(1), {
          at: at('2026-11-18T05:00:00.000Z'),
          preview: text('q'),
          replyToken: 'rt-1',
          replyTokenExpiresAt: at('2026-11-18T05:00:50.000Z'),
        });
      };

      it('clears the token once and only for the same value', async () => {
        await withToken();
        expect(await repo.consumeReplyToken(contactId(1), 'rt-other')).toBe(false);
        expect((await get(contactId(1))).replyToken).toBe('rt-1');
        expect(await repo.consumeReplyToken(contactId(1), 'rt-1')).toBe(true);
        expect(await get(contactId(1))).toMatchObject({
          replyToken: null,
          replyTokenExpiresAt: null,
        });
        expect(await repo.consumeReplyToken(contactId(1), 'rt-1')).toBe(false);
      });

      it('gives true to one of several concurrent callers', async () => {
        await withToken();
        const results = await Promise.all(
          Array.from({ length: 5 }, () => repo.consumeReplyToken(contactId(1), 'rt-1')),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
      });
    });

    it('setAiEnabled, setNeedsAdmin, clearNeedsAdmin and markRead set their fields', async () => {
      await create(1);
      await repo.setAiEnabled(contactId(1), true);
      expect((await get(contactId(1))).aiEnabled).toBe(true);
      await repo.setAiEnabled(contactId(1), false);
      expect((await get(contactId(1))).aiEnabled).toBe(false);

      await repo.setNeedsAdmin(contactId(1), 'customer_sent_image');
      expect(await get(contactId(1))).toMatchObject({
        needsAdmin: true,
        needsAdminReason: 'customer_sent_image',
      });
      await repo.setNeedsAdmin(contactId(1), 'budget_reached');
      expect(await get(contactId(1))).toMatchObject({
        needsAdmin: true,
        needsAdminReason: 'budget_reached',
      });
      await repo.clearNeedsAdmin(contactId(1));
      expect(await get(contactId(1))).toMatchObject({ needsAdmin: false, needsAdminReason: null });

      for (const s of ['05:00:00', '05:00:01']) {
        await repo.recordInbound(contactId(1), {
          at: at(`2026-11-18T${s}.000Z`),
          preview: text('q'),
          replyToken: null,
          replyTokenExpiresAt: null,
        });
      }
      expect((await get(contactId(1))).unreadCount).toBe(2);
      await repo.markRead(contactId(1));
      expect((await get(contactId(1))).unreadCount).toBe(0);
    });

    describe('AI lock', () => {
      it('tryAcquireAiLock moves idle to replying and refuses a held lock', async () => {
        await create(1);
        expect(await repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:00.000Z'))).toBe(
          true,
        );
        expect(await get(contactId(1))).toMatchObject({
          aiState: 'replying',
          aiStateAt: at('2026-11-18T05:00:00.000Z'),
        });
        expect(await repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:01.000Z'))).toBe(
          false,
        );
        expect((await get(contactId(1))).aiStateAt).toEqual(at('2026-11-18T05:00:00.000Z'));
      });

      it('does not take over a stale lock', async () => {
        await create(1);
        await repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:00.000Z'));
        expect(await repo.tryAcquireAiLock(contactId(1), at('2026-11-19T05:00:00.000Z'))).toBe(
          false,
        );
      });

      it('gives true to one of several concurrent callers', async () => {
        await create(1);
        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:00.000Z')),
          ),
        );
        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it('releaseAiLock sets idle with a null aiStateAt and is safe when already idle', async () => {
        await create(1);
        await repo.releaseAiLock(contactId(1));
        await repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:00.000Z'));
        await repo.releaseAiLock(contactId(1));
        expect(await get(contactId(1))).toMatchObject({ aiState: 'idle', aiStateAt: null });
        expect(await repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:05.000Z'))).toBe(
          true,
        );
      });
    });

    describe('recoverStuckAiStates', () => {
      it('frees only locks older than staleBefore, sets ai_timeout and returns their ids', async () => {
        await create(1);
        await create(2);
        await create(3);
        await create(4);
        await repo.tryAcquireAiLock(contactId(1), at('2026-11-18T05:00:00.000Z'));
        await repo.tryAcquireAiLock(contactId(2), at('2026-11-18T05:03:00.000Z'));
        await repo.tryAcquireAiLock(contactId(4), at('2026-11-18T04:00:00.000Z'));
        const before1 = (await get(contactId(1))).updatedSeq;

        const recovered = await repo.recoverStuckAiStates(at('2026-11-18T05:03:00.000Z'));

        expect([...recovered].sort()).toEqual([contactId(1), contactId(4)]);
        for (const id of [contactId(1), contactId(4)]) {
          expect(await get(id)).toMatchObject({
            aiState: 'idle',
            aiStateAt: null,
            needsAdmin: true,
            needsAdminReason: 'ai_timeout',
          });
        }
        expect((await get(contactId(1))).updatedSeq).toBeGreaterThan(before1);
        // aiStateAt equal to staleBefore is not stale (strictly older only).
        expect(await get(contactId(2))).toMatchObject({ aiState: 'replying', needsAdmin: false });
        expect(await get(contactId(3))).toMatchObject({ aiState: 'idle', needsAdmin: false });
        expect(await repo.recoverStuckAiStates(at('2026-11-18T05:03:00.000Z'))).toEqual([]);
      });
    });

    describe('list', () => {
      const seedForList = async () => {
        // createdAt only: 1 at 01:00, 2 at 02:00. 3 has a customer message at 03:00. 4 and 5 tie
        // with customer messages at 02:30. 1 and 2 got a reply later, which does not move them.
        await create(1, '2026-11-18T01:00:00.000Z');
        await create(2, '2026-11-18T02:00:00.000Z');
        await create(3, '2026-11-18T00:00:00.000Z');
        await create(4, '2026-11-18T00:00:00.000Z');
        await create(5, '2026-11-18T00:00:00.000Z');
        await repo.recordInbound(contactId(3), {
          at: at('2026-11-18T03:00:00.000Z'),
          preview: text('q'),
          replyToken: null,
          replyTokenExpiresAt: null,
        });
        for (const n of [4, 5]) {
          await repo.recordInbound(contactId(n), {
            at: at('2026-11-18T02:30:00.000Z'),
            preview: text('a'),
            replyToken: null,
            replyTokenExpiresAt: null,
          });
        }
        for (const n of [1, 2]) {
          await repo.recordOutbound(contactId(n), { preview: text('ตอบ'), by: 'admin' });
        }
      };

      it('orders by the latest inbound time (else createdAt) newest first, then id newest first', async () => {
        await seedForList();
        const r = await repo.list({ filter: 'all', search: null, before: null, limit: 50 });
        expect(r.contacts.map((c) => c.id)).toEqual([3, 5, 4, 2, 1].map(contactId));
        expect(r.next).toBeNull();
      });

      it('pages with a cursor that resumes after the last row', async () => {
        await seedForList();
        const p1 = await repo.list({ filter: 'all', search: null, before: null, limit: 2 });
        expect(p1.contacts.map((c) => c.id)).toEqual([3, 5].map(contactId));
        expect(p1.next).toEqual({ sortAt: at('2026-11-18T02:30:00.000Z'), id: contactId(5) });
        if (!p1.next) throw new Error('expected a cursor');
        const p2 = await repo.list({ filter: 'all', search: null, before: p1.next, limit: 2 });
        expect(p2.contacts.map((c) => c.id)).toEqual([4, 2].map(contactId));
        if (!p2.next) throw new Error('expected a cursor');
        const p3 = await repo.list({ filter: 'all', search: null, before: p2.next, limit: 2 });
        expect(p3.contacts.map((c) => c.id)).toEqual([contactId(1)]);
        expect(p3.next).toBeNull();
      });

      it('filters unread and needs_admin', async () => {
        await seedForList();
        await repo.setNeedsAdmin(contactId(1), 'ai_failed');
        const unread = await repo.list({ filter: 'unread', search: null, before: null, limit: 50 });
        expect(unread.contacts.map((c) => c.id)).toEqual([3, 5, 4].map(contactId));
        const needs = await repo.list({
          filter: 'needs_admin',
          search: null,
          before: null,
          limit: 50,
        });
        expect(needs.contacts.map((c) => c.id)).toEqual([contactId(1)]);
      });

      it('searches displayName with case-insensitive contains, treating wildcards literally', async () => {
        await seedForList();
        await repo.updateProfile(contactId(1), { displayName: 'Somchai Jaidee', pictureUrl: null });
        await repo.updateProfile(contactId(2), { displayName: 'คุณส้มโอ', pictureUrl: null });
        await repo.updateProfile(contactId(4), { displayName: '100% Mai', pictureUrl: null });
        const ids = async (search: string) =>
          (await repo.list({ filter: 'all', search, before: null, limit: 50 })).contacts.map(
            (c) => c.id,
          );
        expect(await ids('SOMCHAI')).toEqual([contactId(1)]);
        expect(await ids('ส้ม')).toEqual([contactId(2)]);
        expect(await ids('%')).toEqual([contactId(4)]);
        expect(await ids('_')).toEqual([]);
        expect(await ids('nobody')).toEqual([]);
      });
    });

    describe('polling by updatedSeq', () => {
      it('gives every write a new, higher updatedSeq', async () => {
        await create(1);
        const id = contactId(1);
        const writes: (() => Promise<unknown>)[] = [
          () => repo.updateProfile(id, { displayName: 'a', pictureUrl: null }),
          () => repo.setFollowStatus(id, 'following', at(T0)),
          () =>
            repo.recordInbound(id, {
              at: at(T0),
              preview: text('q'),
              replyToken: 'rt',
              replyTokenExpiresAt: at('2026-11-18T03:00:50.000Z'),
            }),
          () => repo.recordOutbound(id, { preview: text('a'), by: 'admin' }),
          () => repo.consumeReplyToken(id, 'rt'),
          () => repo.setAiEnabled(id, true),
          () => repo.setNeedsAdmin(id, 'ai_other'),
          () => repo.clearNeedsAdmin(id),
          () => repo.markRead(id),
          () => repo.tryAcquireAiLock(id, at(T0)),
          () => repo.releaseAiLock(id),
          () => repo.setFollowStatus(id, 'unfollowed', at(T0)),
        ];
        let last: Seq = (await get(id)).updatedSeq;
        for (const write of writes) {
          await write();
          const now = (await get(id)).updatedSeq;
          expect(now).toBeGreaterThan(last);
          last = now;
        }
      });

      it('listChangedAfter returns rows changed after the cursor in updatedSeq order', async () => {
        await create(1);
        await create(2);
        await create(3);
        const cursor = await repo.maxUpdatedSeq();
        expect(cursor).toBe((await get(contactId(3))).updatedSeq);

        await repo.setAiEnabled(contactId(1), true);
        await repo.markRead(contactId(3));
        const r = await repo.listChangedAfter(cursor, 10);
        expect(r.contacts.map((c) => c.id)).toEqual([contactId(1), contactId(3)]);
        expect(r.contacts[0]?.aiEnabled).toBe(true);
        expect(r.hasMore).toBe(false);
        expect(r.contacts[1]?.updatedSeq).toBe(await repo.maxUpdatedSeq());

        const limited = await repo.listChangedAfter(cursor, 1);
        expect(limited.contacts.map((c) => c.id)).toEqual([contactId(1)]);
        expect(limited.hasMore).toBe(true);

        const all = await repo.listChangedAfter(0n as Seq, 10); // brand: the lowest cursor
        expect(all.contacts.map((c) => c.id)).toEqual([2, 1, 3].map(contactId));
      });

      it('maxUpdatedSeq is 0 for an empty table', async () => {
        expect(await repo.maxUpdatedSeq()).toBe(0n);
      });
    });

    it('countByFilter counts all, unread and needs_admin', async () => {
      expect(await repo.countByFilter()).toEqual({ all: 0, unread: 0, needsAdmin: 0 });
      await create(1);
      await create(2);
      await create(3);
      await repo.recordInbound(contactId(1), {
        at: at(T0),
        preview: text('q'),
        replyToken: null,
        replyTokenExpiresAt: null,
      });
      await repo.setNeedsAdmin(contactId(1), 'ai_failed');
      await repo.setNeedsAdmin(contactId(2), 'ai_failed');
      expect(await repo.countByFilter()).toEqual({ all: 3, unread: 1, needsAdmin: 2 });
    });

    it('writes to a missing row do nothing and do not throw', async () => {
      const id = contactId(404);
      await repo.updateProfile(id, { displayName: 'x', pictureUrl: null });
      await repo.setFollowStatus(id, 'unfollowed', at(T0));
      await repo.recordInbound(id, {
        at: at(T0),
        preview: text('q'),
        replyToken: 'rt',
        replyTokenExpiresAt: at(T0),
      });
      await repo.recordOutbound(id, { preview: text('a'), by: 'ai' });
      await repo.setAiEnabled(id, true);
      await repo.setNeedsAdmin(id, 'ai_failed');
      await repo.clearNeedsAdmin(id);
      await repo.markRead(id);
      await repo.releaseAiLock(id);
      expect(await repo.consumeReplyToken(id, 'rt')).toBe(false);
      expect(await repo.tryAcquireAiLock(id, at(T0))).toBe(false);
      expect(await repo.findById(id)).toBeNull();
      expect((await repo.countByFilter()).all).toBe(0);
    });
  });
};
