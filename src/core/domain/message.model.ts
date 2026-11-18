import type {
  DeliveryStatus,
  EventCode,
  MediaStatus,
  MessageAuthor,
  MessageDirection,
  MessageType,
  OtherKind,
} from './enums.model';
import type { ErrorCode } from './result';
import type { ContactId, LineMessageId, MessageId, Seq } from './ids';

export interface Message {
  id: MessageId;
  /** Order of insertion. Never changes. */
  seq: Seq;
  updatedSeq: Seq;
  contactId: ContactId;
  direction: MessageDirection;
  author: MessageAuthor;
  type: MessageType;
  text: string | null;
  mediaUrl: string | null;
  previewUrl: string | null;
  /** null unless the message is an image or a video. */
  mediaStatus: MediaStatus | null;
  stickerPackageId: string | null;
  stickerId: string | null;
  otherKind: OtherKind | null;
  eventCode: EventCode | null;
  /** Inbound only. */
  lineMessageId: LineMessageId | null;
  /** Outbound only. */
  deliveryStatus: DeliveryStatus | null;
  deliveryError: ErrorCode | null;
  /** Outbound: equals id. */
  retryKey: string | null;
  createdAt: Date;
  sentAt: Date | null;
}
