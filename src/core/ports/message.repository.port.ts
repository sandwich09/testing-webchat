import type {
  ContactId,
  ErrorCode,
  EventCode,
  MediaStatus,
  Message,
  MessageId,
  Seq,
} from '@/core/domain';
import type { DateRange } from './usage.repository.port';

export type NewMessage = Omit<Message, 'seq' | 'updatedSeq'>;

export interface MessageRepository {
  findById(id: MessageId): Promise<Message | null>;
  /** Insert-if-absent by lineMessageId. Returns the existing row on a duplicate. */
  insertInboundIfAbsent(m: NewMessage): Promise<{ inserted: boolean; message: Message }>;
  /** Insert-if-absent by id. */
  insertOutboundIfAbsent(m: NewMessage): Promise<{ inserted: boolean; message: Message }>;
  insertEvent(m: NewMessage): Promise<Message>;

  markSent(id: MessageId, at: Date): Promise<Message>;
  markFailed(id: MessageId, code: ErrorCode): Promise<Message>;
  /** Compare-and-set: failed to pending, clears deliveryError. false if the status is not failed. */
  markPendingIfFailed(id: MessageId): Promise<boolean>;
  /**
   * Compare-and-set on `mediaStatus = pending`: sets ready with both URLs. false (nothing changed)
   * if the message is missing or its media is no longer pending, so one StoreInboundMedia run wins.
   */
  setMediaReady(id: MessageId, mediaUrl: string, previewUrl: string): Promise<boolean>;
  /** Compare-and-set on `mediaStatus = pending`, like setMediaReady. */
  setMediaStatus(
    id: MessageId,
    status: Exclude<MediaStatus, 'ready' | 'pending'>,
  ): Promise<boolean>;

  /** The latest inbound message of that customer by seq. */
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
  countForContact(contactId: ContactId): Promise<{ total: number; byAi: number }>;
  /**
   * Event lines (type event) of every contact with createdAt in [from, to), counted by eventCode.
   * A code without rows is not in the result. Used by GetGuardrailStats.
   */
  countEventsByCode(range: DateRange): Promise<Partial<Record<EventCode, number>>>;
}
