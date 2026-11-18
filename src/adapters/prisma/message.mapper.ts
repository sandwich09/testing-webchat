import {
  ERROR_CODES,
  EVENT_CODES,
  type ContactId,
  type ErrorCode,
  type EventCode,
  type LineMessageId,
  type Message,
  type MessageId,
  type Seq,
} from '@/core/domain';
import type { NewMessage } from '@/core/ports';
import type { Message as MessageRow, Prisma } from './generated/client';

const eventCodes: ReadonlySet<string> = new Set(EVENT_CODES);
const errorCodes: ReadonlySet<string> = new Set(ERROR_CODES);

// eventCode and deliveryError are plain text columns; a value outside the domain lists is a bug.
const toEventCode = (value: string | null): EventCode | null => {
  if (value === null) return null;
  if (!eventCodes.has(value)) throw new Error('Message.eventCode holds an unknown code');
  return value as EventCode; // brand: checked against EVENT_CODES above
};

const toErrorCode = (value: string | null): ErrorCode | null => {
  if (value === null) return null;
  if (!errorCodes.has(value)) throw new Error('Message.deliveryError holds an unknown code');
  return value as ErrorCode; // brand: checked against ERROR_CODES above
};

/** Database row to domain entity. */
export const toMessage = (row: MessageRow): Message => ({
  id: row.id as MessageId, // brand: id read back from the Message table
  seq: row.seq as Seq, // brand: from change_seq
  updatedSeq: row.updatedSeq as Seq, // brand: set from change_seq by the database trigger
  contactId: row.contactId as ContactId, // brand: foreign key to Contact
  direction: row.direction,
  author: row.author,
  type: row.type,
  text: row.text,
  mediaUrl: row.mediaUrl,
  previewUrl: row.previewUrl,
  mediaStatus: row.mediaStatus,
  stickerPackageId: row.stickerPackageId,
  stickerId: row.stickerId,
  otherKind: row.otherKind,
  eventCode: toEventCode(row.eventCode),
  lineMessageId: row.lineMessageId as LineMessageId | null, // brand: stored from a LINE message.id
  deliveryStatus: row.deliveryStatus,
  deliveryError: toErrorCode(row.deliveryError),
  retryKey: row.retryKey,
  createdAt: row.createdAt,
  sentAt: row.sentAt,
});

/** Domain message to the row inserted. `seq` and `updatedSeq` come from the database. */
export const toNewMessageRow = (m: NewMessage): Prisma.MessageCreateManyInput => ({
  id: m.id,
  contactId: m.contactId,
  direction: m.direction,
  author: m.author,
  type: m.type,
  text: m.text,
  mediaUrl: m.mediaUrl,
  previewUrl: m.previewUrl,
  mediaStatus: m.mediaStatus,
  stickerPackageId: m.stickerPackageId,
  stickerId: m.stickerId,
  otherKind: m.otherKind,
  eventCode: m.eventCode,
  lineMessageId: m.lineMessageId,
  deliveryStatus: m.deliveryStatus,
  deliveryError: m.deliveryError,
  retryKey: m.retryKey,
  createdAt: m.createdAt,
  sentAt: m.sentAt,
});
