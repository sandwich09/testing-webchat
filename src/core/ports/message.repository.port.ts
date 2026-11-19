import type {
  ContactId,
  ErrorCode,
  EventCode,
  LineMessageId,
  MediaFailure,
  MediaStatus,
  Message,
  MessageId,
  Seq,
  WebhookEventId,
} from '@/core/domain';
import type { DateRange } from './usage.repository.port';

/**
 * `firstPushAt` starts null and is set only by `recordFirstPush`; `lineSentIds` starts empty and
 * is set by `markSent`. `quotedLineMessageId` is given for an inbound text that quotes a message.
 */
export type NewMessage = Omit<
  Message,
  | 'seq'
  | 'updatedSeq'
  | 'firstPushAt'
  | 'lineSentIds'
  | 'quotedLineMessageId'
  | 'mediaDurationMs'
  | 'mediaFailure'
> & {
  mediaFailure?: MediaFailure | null;
  quotedLineMessageId?: LineMessageId | null;
  mediaDurationMs?: number | null;
  /**
   * The webhook event of an inbound row without a lineMessageId (a rich menu or welcome card
   * tap): its unique key, so a redelivery racing the first delivery stores the tap once.
   */
  webhookEventId?: WebhookEventId | null;
};

export interface MessageRepository {
  findById(id: MessageId): Promise<Message | null>;
  /**
   * Insert-if-absent by lineMessageId, or by webhookEventId for a row without one (a tap).
   * Returns the existing row on a duplicate.
   */
  insertInboundIfAbsent(m: NewMessage): Promise<{ inserted: boolean; message: Message }>;
  /** Insert-if-absent by id. */
  insertOutboundIfAbsent(m: NewMessage): Promise<{ inserted: boolean; message: Message }>;
  insertEvent(m: NewMessage): Promise<Message>;

  /** Sets sent, the time and the LINE ids of the parts (empty when LINE gave none). */
  markSent(id: MessageId, at: Date, lineSentIds: readonly LineMessageId[]): Promise<Message>;
  markFailed(id: MessageId, code: ErrorCode): Promise<Message>;
  /**
   * Compare-and-set: failed to pending, clears deliveryError and sets the start of the delivery
   * attempt to `at`. false if the status is not failed.
   */
  markPendingIfFailed(id: MessageId, at: Date): Promise<boolean>;
  /**
   * Compare-and-set on `firstPushAt IS NULL`: dates the first push of the message. Later calls
   * change nothing, so the retry key window always counts from the first push.
   */
  recordFirstPush(id: MessageId, at: Date): Promise<void>;
  /**
   * Compare-and-set on `mediaStatus = pending`: sets ready with both URLs. false (nothing changed)
   * if the message is missing or its media is no longer pending, so one StoreInboundMedia run wins.
   */
  setMediaReady(id: MessageId, mediaUrl: string, previewUrl: string): Promise<boolean>;
  /**
   * Compare-and-set on `mediaStatus = pending`, like setMediaReady. `failed` records why
   * (`failure`, default `download_failed`); `too_large` records none.
   */
  setMediaStatus(
    id: MessageId,
    status: Exclude<MediaStatus, 'ready' | 'pending'>,
    failure?: MediaFailure,
  ): Promise<boolean>;

  /**
   * One compare-and-set statement: media of that customer still `pending` with createdAt before
   * `staleBefore` becomes `failed` with the failure `interrupted`. Returns the ids changed, so each row goes to one caller only.
   */
  failStuckMedia(contactId: ContactId, staleBefore: Date): Promise<MessageId[]>;
  /**
   * One compare-and-set statement: outbound messages of that customer still `pending` whose
   * delivery attempt started before `staleBefore` (the insert, or the last markPendingIfFailed)
   * become `failed` with `line.send_interrupted`, so "ส่งอีกครั้ง" works. Returns the ids changed.
   */
  failStuckDeliveries(contactId: ContactId, staleBefore: Date): Promise<MessageId[]>;

  /**
   * The latest inbound message of that customer by seq that an AI run may answer: taps answered
   * with a fixed text only (`NO_AI_TAP_EVENT_CODES`) are skipped.
   */
  latestInbound(contactId: ContactId): Promise<Message | null>;
  /** The latest `limit` messages that are not events, oldest first. */
  recentForAi(contactId: ContactId, limit: number): Promise<Message[]>;

  listLatest(
    contactId: ContactId,
    limit: number,
  ): Promise<{ messages: Message[]; hasOlder: boolean }>;
  listBefore(
    contactId: ContactId,
    beforeSeq: Seq,
    limit: number,
  ): Promise<{ messages: Message[]; hasOlder: boolean }>;
  listChangedAfter(
    contactId: ContactId,
    after: Seq,
    limit: number,
  ): Promise<{ messages: Message[]; hasMore: boolean }>;
  maxUpdatedSeq(contactId: ContactId): Promise<Seq>;
  /**
   * Messages of that customer whose LINE id is one of `lineIds`: an inbound `lineMessageId` or
   * one of the `lineSentIds` of an outbound message. One query, for the quotes of a page.
   */
  findByLineIds(contactId: ContactId, lineIds: readonly LineMessageId[]): Promise<Message[]>;
  countForContact(contactId: ContactId): Promise<{ total: number; byAi: number }>;
  /**
   * Event lines (type event) of every contact with createdAt in [from, to), counted by eventCode.
   * A code without rows is not in the result. Used by GetGuardrailStats.
   */
  countEventsByCode(range: DateRange): Promise<Partial<Record<EventCode, number>>>;
}
