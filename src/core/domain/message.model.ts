import type {
  DeliveryStatus,
  EventCode,
  MediaFailure,
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
  /** null unless the message is an image, a video or an audio message. */
  mediaStatus: MediaStatus | null;
  /** Inbound media `failed`: why; null otherwise, and for rows stored before it was recorded. */
  mediaFailure: MediaFailure | null;
  /** Inbound audio: the length LINE gave in the event, in milliseconds; null when unknown. */
  mediaDurationMs: number | null;
  stickerPackageId: string | null;
  stickerId: string | null;
  otherKind: OtherKind | null;
  eventCode: EventCode | null;
  /** Inbound only. */
  lineMessageId: LineMessageId | null;
  /** Inbound: the LINE message id the customer replied to with LINE's quote, or null. */
  quotedLineMessageId: LineMessageId | null;
  /**
   * Outbound: the LINE message ids of the parts LINE accepted, in part order, from the
   * `sentMessages` of the reply or push answer. Empty until sent, and when LINE gave none.
   */
  lineSentIds: readonly LineMessageId[];
  /** Outbound only. */
  deliveryStatus: DeliveryStatus | null;
  deliveryError: ErrorCode | null;
  /** Outbound: equals id. */
  retryKey: string | null;
  createdAt: Date;
  sentAt: Date | null;
  /**
   * Outbound: when the first push with retryKey was attempted, or null when none was. Unlike the
   * start of the current attempt it never moves, so it dates LINE's retry key window.
   */
  firstPushAt: Date | null;
}
