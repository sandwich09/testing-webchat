import type {
  DocumentId,
  DocumentStatus,
  ErrorCode,
  KbDocument,
  KbDocumentWithText,
} from '@/core/domain';
import type { KbDocument as KbDocumentRow } from './generated/client';

export function toKbDocument(row: Omit<KbDocumentRow, 'extractedText'>): KbDocument {
  return {
    id: row.id as DocumentId, // brand: UUIDv7 made by IdGenerator
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    pageCount: row.pageCount,
    tokenCount: row.tokenCount,
    status: row.status satisfies DocumentStatus,
    error: row.error as ErrorCode | null, // brand: the column holds an error-catalog code
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toKbDocumentWithText(row: KbDocumentRow): KbDocumentWithText {
  return { ...toKbDocument(row), extractedText: row.extractedText };
}
