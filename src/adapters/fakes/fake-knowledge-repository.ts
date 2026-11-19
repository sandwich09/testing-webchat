import { err, ok, type DocumentId, type KbDocument, type KbDocumentWithText } from '@/core/domain';
import type { KnowledgeRepository } from '@/core/ports';

const withoutText = (row: KbDocumentWithText): KbDocument => {
  const doc: Partial<KbDocumentWithText> = structuredClone(row);
  delete doc.extractedText;
  return doc as KbDocument; // every KbDocument field is still present
};

/** In-memory KnowledgeRepository. `sha256` is unique, like the database column. */
export class FakeKnowledgeRepository implements KnowledgeRepository {
  private readonly rows = new Map<DocumentId, KbDocumentWithText>();

  private bySha(sha256: string): KbDocumentWithText | undefined {
    return [...this.rows.values()].find((d) => d.sha256 === sha256);
  }

  readonly create: KnowledgeRepository['create'] = (d) => {
    if (this.bySha(d.sha256)) return Promise.resolve(err('knowledge.duplicate'));
    if (this.rows.has(d.id)) {
      return Promise.reject(new Error('FakeKnowledgeRepository.create: id already used'));
    }
    const row: KbDocumentWithText = {
      id: d.id,
      fileName: d.fileName,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      pageCount: null,
      tokenCount: null,
      status: 'processing',
      error: null,
      createdAt: d.now,
      updatedAt: d.now,
      extractedText: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve(ok(withoutText(row)));
  };

  readonly findById: KnowledgeRepository['findById'] = (id) => {
    const row = this.rows.get(id);
    return Promise.resolve(row ? withoutText(row) : null);
  };

  readonly findBySha256: KnowledgeRepository['findBySha256'] = (sha256) => {
    const row = this.bySha(sha256);
    return Promise.resolve(row ? withoutText(row) : null);
  };

  readonly getWithText: KnowledgeRepository['getWithText'] = (id) => {
    const row = this.rows.get(id);
    return Promise.resolve(row ? structuredClone(row) : null);
  };

  readonly list: KnowledgeRepository['list'] = () =>
    Promise.resolve(
      [...this.rows.values()]
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .map(withoutText),
    );

  readonly restartProcessing: KnowledgeRepository['restartProcessing'] = (id, d) => {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(err('knowledge.not_found'));
    // Compare-and-set on failed, checked in the same synchronous step as the update.
    if (row.status !== 'failed') return Promise.resolve(err('knowledge.not_retryable'));
    const other = this.bySha(d.sha256);
    if (other && other.id !== id) return Promise.resolve(err('knowledge.duplicate'));
    Object.assign(row, {
      fileName: d.fileName,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      status: 'processing',
      error: null,
      extractedText: null,
      pageCount: null,
      tokenCount: null,
      updatedAt: d.now,
    } satisfies Partial<KbDocumentWithText>);
    return Promise.resolve(ok(withoutText(row)));
  };

  readonly markReady: KnowledgeRepository['markReady'] = (id, d) => {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(false);
    Object.assign(row, {
      status: 'ready',
      error: null,
      extractedText: d.text,
      pageCount: d.pageCount,
      tokenCount: d.tokenCount,
      updatedAt: d.now,
    } satisfies Partial<KbDocumentWithText>);
    return Promise.resolve(true);
  };

  readonly markFailed: KnowledgeRepository['markFailed'] = (id, d) => {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(false);
    Object.assign(row, {
      status: 'failed',
      error: d.code,
      extractedText: null,
      pageCount: d.pageCount,
      tokenCount: d.tokenCount,
      updatedAt: d.now,
    } satisfies Partial<KbDocumentWithText>);
    return Promise.resolve(true);
  };

  readonly failStuckProcessing: KnowledgeRepository['failStuckProcessing'] = (staleBefore, now) => {
    const stuck = [...this.rows.values()].filter(
      (d) => d.status === 'processing' && d.updatedAt.getTime() < staleBefore.getTime(),
    );
    for (const d of stuck) {
      Object.assign(d, {
        status: 'failed',
        error: 'knowledge.extract_interrupted',
        updatedAt: now,
      } satisfies Partial<KbDocumentWithText>);
    }
    return Promise.resolve(stuck.map((d) => d.id));
  };

  readonly delete: KnowledgeRepository['delete'] = (id) => Promise.resolve(this.rows.delete(id));

  readonly sumReadyTokens: KnowledgeRepository['sumReadyTokens'] = () => {
    let sum = 0;
    for (const d of this.rows.values()) if (d.status === 'ready') sum += d.tokenCount ?? 0;
    return Promise.resolve(sum);
  };
}
