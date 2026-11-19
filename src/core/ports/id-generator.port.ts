import type { CannedReplyId, ContactId, DocumentId, MessageId, UsageId } from '@/core/domain';

export interface IdGenerator {
  /** UUIDv7. */
  contactId(): ContactId;
  messageId(): MessageId;
  documentId(): DocumentId;
  usageId(): UsageId;
  cannedReplyId(): CannedReplyId;
  requestId(): string;
  /** 128 random bits from a CSPRNG, base64url. For file names that must not be guessable. */
  randomToken(): string;
}
