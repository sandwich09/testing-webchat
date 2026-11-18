import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentId } from '@/core/domain';
import type { KnowledgeRepository } from '@/core/ports';

const docId = (n: number): DocumentId =>
  `22222222-0000-7000-8000-${n.toString(16).padStart(12, '0')}` as DocumentId; // brand: test id
const sha = (n: number): string => n.toString(16).padStart(64, '0');
const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 18, 3, minute));

/**
 * Runs the KnowledgeRepository contract (docs/architecture/domain-and-ports.md) against the subject.
 *
 * `makeSubject` runs before every test and must return a repository over an empty KbDocument table.
 */
export const describeKnowledgeRepositorySuite = (
  makeSubject: () => KnowledgeRepository | Promise<KnowledgeRepository>,
): void => {
  describe('KnowledgeRepository contract', () => {
    let repo: KnowledgeRepository;

    beforeEach(async () => {
      repo = await makeSubject();
    });

    const create = (n: number, minute = n) =>
      repo.create({
        id: docId(n),
        fileName: `menu-${String(n)}.pdf`,
        sizeBytes: 1000 + n,
        sha256: sha(n),
        now: at(minute),
      });

    it('create stores a processing document', async () => {
      const r = await create(1);
      const expected = {
        id: docId(1),
        fileName: 'menu-1.pdf',
        sizeBytes: 1001,
        sha256: sha(1),
        pageCount: null,
        tokenCount: null,
        status: 'processing',
        error: null,
        createdAt: at(1),
        updatedAt: at(1),
      };
      expect(r).toEqual({ ok: true, value: expected });
      expect(await repo.findById(docId(1))).toEqual(expected);
      expect(await repo.findBySha256(sha(1))).toEqual(expected);
      expect(await repo.getWithText(docId(1))).toEqual({ ...expected, extractedText: null });
    });

    it('create returns knowledge.duplicate for a known sha256', async () => {
      await create(1);
      const dup = await repo.create({
        id: docId(2),
        fileName: 'copy.pdf',
        sizeBytes: 5,
        sha256: sha(1),
        now: at(2),
      });
      expect(dup.ok).toBe(false);
      if (!dup.ok) expect(dup.error.code).toBe('knowledge.duplicate');
      expect(await repo.findById(docId(2))).toBeNull();
    });

    it('create with the same sha256 concurrently has one winner', async () => {
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) =>
          repo.create({
            id: docId(n),
            fileName: 'a.pdf',
            sizeBytes: 1,
            sha256: sha(9),
            now: at(0),
          }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await repo.list()).toHaveLength(1);
    });

    it('lookups return null for unknown documents', async () => {
      expect(await repo.findById(docId(404))).toBeNull();
      expect(await repo.findBySha256(sha(404))).toBeNull();
      expect(await repo.getWithText(docId(404))).toBeNull();
    });

    it('list returns documents without text, newest first', async () => {
      await create(1, 5);
      await create(2, 9);
      await create(3, 1);
      await repo.markReady(docId(1), {
        text: 'secret menu',
        pageCount: 1,
        tokenCount: 10,
        now: at(10),
      });
      const list = await repo.list();
      expect(list.map((d) => d.id)).toEqual([2, 1, 3].map(docId));
      for (const d of list) expect(d).not.toHaveProperty('extractedText');
    });

    it('markReady stores the text and counts; markFailed stores the error', async () => {
      await create(1);
      await create(2);
      expect(
        await repo.markReady(docId(1), { text: 'เมนู', pageCount: 3, tokenCount: 120, now: at(20) }),
      ).toBe(true);
      expect(await repo.getWithText(docId(1))).toMatchObject({
        status: 'ready',
        error: null,
        extractedText: 'เมนู',
        pageCount: 3,
        tokenCount: 120,
        updatedAt: at(20),
        createdAt: at(1),
      });
      expect(
        await repo.markFailed(docId(2), {
          code: 'knowledge.too_many_pages',
          pageCount: 31,
          tokenCount: null,
          now: at(21),
        }),
      ).toBe(true);
      expect(await repo.findById(docId(2))).toMatchObject({
        status: 'failed',
        error: 'knowledge.too_many_pages',
        pageCount: 31,
        tokenCount: null,
        updatedAt: at(21),
      });
    });

    it('markReady, markFailed and delete return false when the row is gone', async () => {
      await create(1);
      expect(await repo.delete(docId(1))).toBe(true);
      expect(await repo.delete(docId(1))).toBe(false);
      expect(await repo.findById(docId(1))).toBeNull();
      expect(
        await repo.markReady(docId(1), { text: 't', pageCount: 1, tokenCount: 1, now: at(2) }),
      ).toBe(false);
      expect(
        await repo.markFailed(docId(1), {
          code: 'knowledge.extract_failed',
          pageCount: null,
          tokenCount: null,
          now: at(2),
        }),
      ).toBe(false);
    });

    describe('restartProcessing', () => {
      const fail = (n: number) =>
        repo.markFailed(docId(n), {
          code: 'knowledge.extract_failed',
          pageCount: null,
          tokenCount: null,
          now: at(20),
        });

      it('resets the document to processing with the new file values', async () => {
        await create(1);
        await repo.markFailed(docId(1), {
          code: 'knowledge.extract_failed',
          pageCount: 2,
          tokenCount: 50,
          now: at(2),
        });
        const r = await repo.restartProcessing(docId(1), {
          fileName: 'menu-v2.pdf',
          sizeBytes: 2222,
          sha256: sha(7),
          now: at(30),
        });
        const expected = {
          id: docId(1),
          fileName: 'menu-v2.pdf',
          sizeBytes: 2222,
          sha256: sha(7),
          pageCount: null,
          tokenCount: null,
          status: 'processing',
          error: null,
          createdAt: at(1),
          updatedAt: at(30),
        };
        expect(r).toEqual({ ok: true, value: expected });
        expect(await repo.getWithText(docId(1))).toEqual({ ...expected, extractedText: null });
        expect(await repo.findBySha256(sha(1))).toBeNull();
      });

      it('accepts the same file again', async () => {
        await create(1);
        await fail(1);
        const r = await repo.restartProcessing(docId(1), {
          fileName: 'menu-1.pdf',
          sizeBytes: 1001,
          sha256: sha(1),
          now: at(30),
        });
        expect(r.ok).toBe(true);
      });

      it('returns knowledge.duplicate when another document has the sha256', async () => {
        await create(1);
        await fail(1);
        await create(2);
        const r = await repo.restartProcessing(docId(1), {
          fileName: 'x.pdf',
          sizeBytes: 1,
          sha256: sha(2),
          now: at(30),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('knowledge.duplicate');
        expect((await repo.findById(docId(1)))?.sha256).toBe(sha(1));
      });

      it('returns knowledge.not_found for a missing document', async () => {
        const r = await repo.restartProcessing(docId(404), {
          fileName: 'x.pdf',
          sizeBytes: 1,
          sha256: sha(3),
          now: at(30),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('knowledge.not_found');
      });

      it('returns knowledge.not_retryable and changes nothing unless the document is failed', async () => {
        await create(1);
        await create(2);
        await repo.markReady(docId(2), { text: 't', pageCount: 1, tokenCount: 9, now: at(5) });
        for (const n of [1, 2]) {
          const before = await repo.getWithText(docId(n));
          const r = await repo.restartProcessing(docId(n), {
            fileName: 'x.pdf',
            sizeBytes: 1,
            sha256: sha(n),
            now: at(30),
          });
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe('knowledge.not_retryable');
          expect(await repo.getWithText(docId(n))).toEqual(before);
        }
      });

      it('restarts for one of several concurrent callers; the others get knowledge.not_retryable', async () => {
        await create(1);
        await fail(1);
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            repo.restartProcessing(docId(1), {
              fileName: 'menu-1.pdf',
              sizeBytes: 1001,
              sha256: sha(1),
              now: at(30),
            }),
          ),
        );
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        for (const r of results) if (!r.ok) expect(r.error.code).toBe('knowledge.not_retryable');
        expect((await repo.findById(docId(1)))?.status).toBe('processing');
      });
    });

    it('sumReadyTokens adds the tokens of ready documents only', async () => {
      expect(await repo.sumReadyTokens()).toBe(0);
      await create(1);
      await create(2);
      await create(3);
      await repo.markReady(docId(1), { text: 'a', pageCount: 1, tokenCount: 100, now: at(9) });
      await repo.markReady(docId(2), { text: 'b', pageCount: null, tokenCount: 250, now: at(9) });
      await repo.markFailed(docId(3), {
        code: 'knowledge.capacity_exceeded',
        pageCount: 1,
        tokenCount: 999,
        now: at(9),
      });
      expect(await repo.sumReadyTokens()).toBe(350);
    });
  });
};
