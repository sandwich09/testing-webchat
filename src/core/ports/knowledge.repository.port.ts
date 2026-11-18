import type { DocumentId, ErrorCode, KbDocument, KbDocumentWithText, Result } from '@/core/domain';

export interface KnowledgeRepository {
  create(d: {
    id: DocumentId;
    fileName: string;
    sizeBytes: number;
    sha256: string;
    now: Date;
  }): Promise<Result<KbDocument, 'knowledge.duplicate'>>;
  findById(id: DocumentId): Promise<KbDocument | null>;
  findBySha256(sha256: string): Promise<KbDocument | null>;
  getWithText(id: DocumentId): Promise<KbDocumentWithText | null>;
  /** Without extractedText, newest createdAt first. */
  list(): Promise<KbDocument[]>;
  /**
   * For retry. Compare-and-set on `status = failed`: sets processing and clears the error, text,
   * page count and tokens, replacing the file values. `knowledge.not_retryable` when the document
   * is not failed (also the loser of two concurrent retries), so only one extraction starts.
   */
  restartProcessing(
    id: DocumentId,
    d: { fileName: string; sizeBytes: number; sha256: string; now: Date },
  ): Promise<
    Result<KbDocument, 'knowledge.duplicate' | 'knowledge.not_found' | 'knowledge.not_retryable'>
  >;
  markReady(
    id: DocumentId,
    d: { text: string; pageCount: number | null; tokenCount: number; now: Date },
  ): Promise<boolean>;
  markFailed(
    id: DocumentId,
    d: { code: ErrorCode; pageCount: number | null; tokenCount: number | null; now: Date },
  ): Promise<boolean>;
  delete(id: DocumentId): Promise<boolean>;
  sumReadyTokens(): Promise<number>;
}
