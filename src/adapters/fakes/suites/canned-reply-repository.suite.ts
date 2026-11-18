import { beforeEach, describe, expect, it } from 'vitest';
import type { CannedReply, CannedReplyId } from '@/core/domain';
import type { CannedReplyRepository } from '@/core/ports';

const replyId = (n: number): CannedReplyId =>
  `44444444-0000-7000-8000-${n.toString(16).padStart(12, '0')}` as CannedReplyId; // brand: test id
const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 18, 3, minute));

const reply = (n: number, sortOrder: number, minute = n): CannedReply => ({
  id: replyId(n),
  title: `title ${String(n)}`,
  text: `text ${String(n)}`,
  sortOrder,
  createdAt: at(minute),
  updatedAt: at(minute),
});

/**
 * Runs the CannedReplyRepository contract (docs/architecture/domain-and-ports.md) against the
 * subject. `makeSubject` runs before every test and must return a repository over an empty table.
 */
export const describeCannedReplyRepositorySuite = (
  makeSubject: () => CannedReplyRepository | Promise<CannedReplyRepository>,
): void => {
  describe('CannedReplyRepository contract', () => {
    let repo: CannedReplyRepository;

    beforeEach(async () => {
      repo = await makeSubject();
    });

    it('is empty at first, and maxSortOrder is 0', async () => {
      expect(await repo.list()).toEqual([]);
      expect(await repo.count()).toBe(0);
      expect(await repo.maxSortOrder()).toBe(0);
      expect(await repo.findById(replyId(1))).toBeNull();
    });

    it('create stores the reply as given', async () => {
      await repo.create(reply(1, 1));
      expect(await repo.findById(replyId(1))).toEqual(reply(1, 1));
      expect(await repo.count()).toBe(1);
    });

    it('list orders by sortOrder, then createdAt', async () => {
      await repo.create(reply(1, 2, 1));
      await repo.create(reply(2, 1, 5));
      await repo.create(reply(3, 1, 2));
      await repo.create(reply(4, 3, 0));
      expect((await repo.list()).map((c) => c.id)).toEqual([3, 2, 1, 4].map(replyId));
      expect(await repo.maxSortOrder()).toBe(3);
      expect(await repo.count()).toBe(4);
    });

    it('update changes the given fields and updatedAt, and returns the row', async () => {
      await repo.create(reply(1, 1));
      const updated = await repo.update(replyId(1), { title: 'ใหม่', now: at(30) });
      expect(updated).toEqual({ ...reply(1, 1), title: 'ใหม่', updatedAt: at(30) });
      const again = await repo.update(replyId(1), { text: 'ข้อความ', sortOrder: 9, now: at(31) });
      expect(again).toEqual({
        ...reply(1, 1),
        title: 'ใหม่',
        text: 'ข้อความ',
        sortOrder: 9,
        updatedAt: at(31),
      });
      expect(await repo.findById(replyId(1))).toEqual(again);
    });

    it('update returns null for a missing row', async () => {
      expect(await repo.update(replyId(404), { title: 'x', now: at(1) })).toBeNull();
    });

    it('delete returns true once', async () => {
      await repo.create(reply(1, 1));
      expect(await repo.delete(replyId(1))).toBe(true);
      expect(await repo.delete(replyId(1))).toBe(false);
      expect(await repo.findById(replyId(1))).toBeNull();
      expect(await repo.count()).toBe(0);
    });
  });
};
