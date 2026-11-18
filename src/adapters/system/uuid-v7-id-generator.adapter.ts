import { randomBytes, randomUUID } from 'node:crypto';
import { v7 } from 'uuid';
import type { CannedReplyId, ContactId, DocumentId, MessageId, UsageId } from '@/core/domain';
import type { IdGenerator } from '@/core/ports';

/** 128 bits, which base64url encodes as 22 characters. */
const RANDOM_TOKEN_BYTES = 16;

/**
 * Entity ids are UUIDv7 from `uuid`, which keeps a per-process sequence so ids made in the same
 * millisecond still sort in call order. They are partly guessable: public names use randomToken.
 */
export const createUuidV7IdGenerator = (): IdGenerator => ({
  // Each cast brands a fresh UUIDv7, which is what every one of these id types holds.
  contactId: () => v7() as ContactId,
  messageId: () => v7() as MessageId,
  documentId: () => v7() as DocumentId,
  usageId: () => v7() as UsageId,
  cannedReplyId: () => v7() as CannedReplyId,
  requestId: () => randomUUID(),
  randomToken: () => randomBytes(RANDOM_TOKEN_BYTES).toString('base64url'),
});
