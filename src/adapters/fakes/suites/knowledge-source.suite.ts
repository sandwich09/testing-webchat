import { describe, expect, it } from 'vitest';
import type { DocumentId, DocumentStatus } from '@/core/domain';
import { formatKnowledgeBase } from '@/core/domain';
import type { KnowledgeSource } from '@/core/ports';

export interface KnowledgeSeedDocument {
  id: DocumentId;
  fileName: string;
  text: string;
  tokenCount: number;
  status: DocumentStatus;
  createdAt: Date;
}

/**
 * `setLibrary` replaces the whole library: the fake keeps the documents in memory, the real adapter
 * writes them to the database. Insertion order is free; the subject must order them itself.
 */
export interface KnowledgeSourceHarness {
  source: KnowledgeSource;
  setLibrary(documents: KnowledgeSeedDocument[]): Promise<void>;
}

const doc = (n: number, extra: Partial<KnowledgeSeedDocument> = {}): KnowledgeSeedDocument => ({
  id: `00000000-0000-7000-8000-00000000000${String(n)}` as DocumentId,
  fileName: `file-${String(n)}.pdf`,
  text: `=== หน้า 1 ===\nเนื้อหาเอกสาร ${String(n)}`,
  tokenCount: 10 * n,
  status: 'ready',
  createdAt: new Date(Date.UTC(2026, 10, 18, 0, 0, n)),
  ...extra,
});

/** Runs every row of the KnowledgeSource contract in domain-and-ports against the subject. */
export const describeKnowledgeSourceSuite = (
  makeHarness: () => KnowledgeSourceHarness | Promise<KnowledgeSourceHarness>,
): void => {
  describe('KnowledgeSource.getKnowledge', () => {
    it('returns the empty-library block with zero counts for an empty library', async () => {
      const h = await makeHarness();
      await h.setLibrary([]);
      expect(await h.source.getKnowledge()).toEqual({
        text: formatKnowledgeBase([]),
        documentCount: 0,
        tokenCount: 0,
      });
    });

    it('formats the ready documents in createdAt order and sums their tokens', async () => {
      const h = await makeHarness();
      await h.setLibrary([doc(3), doc(1), doc(2)]);
      const result = await h.source.getKnowledge();
      expect(result.text).toBe(
        formatKnowledgeBase(
          [doc(1), doc(2), doc(3)].map((d) => ({ fileName: d.fileName, text: d.text })),
        ),
      );
      expect(result.documentCount).toBe(3);
      expect(result.tokenCount).toBe(60);
    });

    it('breaks a createdAt tie by id', async () => {
      const h = await makeHarness();
      const sameTime = new Date('2026-11-18T00:00:00Z');
      const a = doc(1, { createdAt: sameTime });
      const b = doc(2, { createdAt: sameTime });
      await h.setLibrary([b, a]);
      const result = await h.source.getKnowledge();
      expect(result.text).toBe(
        formatKnowledgeBase([a, b].map((d) => ({ fileName: d.fileName, text: d.text }))),
      );
    });

    it('leaves out documents that are not ready', async () => {
      const h = await makeHarness();
      await h.setLibrary([doc(1), doc(2, { status: 'processing' }), doc(3, { status: 'failed' })]);
      const result = await h.source.getKnowledge();
      expect(result.documentCount).toBe(1);
      expect(result.tokenCount).toBe(10);
      expect(result.text).toBe(
        formatKnowledgeBase([{ fileName: doc(1).fileName, text: doc(1).text }]),
      );
    });

    it('returns the same bytes while the library does not change', async () => {
      const h = await makeHarness();
      await h.setLibrary([doc(2), doc(1)]);
      const first = await h.source.getKnowledge();
      const second = await h.source.getKnowledge();
      expect(second).toEqual(first);
    });
  });
};
