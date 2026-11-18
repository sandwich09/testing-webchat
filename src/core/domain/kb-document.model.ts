import type { DocumentStatus } from './enums.model';
import type { DocumentId } from './ids';
import type { ErrorCode } from './result';

export interface KbDocument {
  id: DocumentId;
  fileName: string;
  sizeBytes: number;
  /** 64 lowercase hex characters. */
  sha256: string;
  pageCount: number | null;
  tokenCount: number | null;
  status: DocumentStatus;
  error: ErrorCode | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KbDocumentWithText extends KbDocument {
  extractedText: string | null;
}
