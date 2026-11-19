import type { DocumentId, DocumentStatus } from '@/core/domain';
import { formatKnowledgeBase } from '@/core/domain';
import type { KnowledgeSource } from '@/core/ports';

export interface FakeKnowledgeDocument {
  id: DocumentId;
  fileName: string;
  text: string;
  tokenCount: number;
  status: DocumentStatus;
  createdAt: Date;
}

/**
 * In-memory library. `getKnowledge` uses only the documents that are `ready`, ordered by
 * createdAt then id, and formats them with `formatKnowledgeBase`, so the text is the same bytes
 * every time while the library does not change.
 */
export class FakeKnowledgeSource implements KnowledgeSource {
  private documents: FakeKnowledgeDocument[] = [];
  getKnowledgeCalls = 0;

  setDocuments(documents: readonly FakeKnowledgeDocument[]): void {
    this.documents = documents.map((d) => ({ ...d, createdAt: new Date(d.createdAt) }));
  }

  getKnowledge(): Promise<{ text: string; documentCount: number; tokenCount: number }> {
    this.getKnowledgeCalls += 1;
    const ready = this.documents
      .filter((d) => d.status === 'ready')
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return Promise.resolve({
      text: formatKnowledgeBase(ready.map((d) => ({ fileName: d.fileName, text: d.text }))),
      documentCount: ready.length,
      tokenCount: ready.reduce((sum, d) => sum + d.tokenCount, 0),
    });
  }
}
