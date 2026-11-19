import type {
  Contact,
  ContactId,
  FollowStatus,
  HandoffReason,
  LineUserId,
  Seq,
  previewOf,
} from '@/core/domain';

export type ContactFilter = 'all' | 'unread' | 'needs_admin';

export interface ContactListCursor {
  sortAt: Date;
  id: ContactId;
}

type MessagePreview = ReturnType<typeof previewOf>;

export interface ContactRepository {
  findById(id: ContactId): Promise<Contact | null>;

  /** Creates the row if missing (aiEnabled false, following). Returns the existing row otherwise. */
  ensure(input: {
    id: ContactId;
    lineUserId: LineUserId;
    now: Date;
  }): Promise<{ contact: Contact; created: boolean }>;

  updateProfile(
    id: ContactId,
    p: { displayName: string | null; pictureUrl: string | null },
  ): Promise<void>;
  setFollowStatus(id: ContactId, status: FollowStatus, at: Date): Promise<void>;

  /**
   * After a new inbound message: unreadCount + 1, the latest inbound time (`lastMessageAt`, the sort
   * key of the list) and the preview when the message is not older, reply token if its expiresAt
   * is newer.
   */
  recordInbound(
    id: ContactId,
    i: {
      at: Date;
      preview: MessagePreview;
      replyToken: string | null;
      replyTokenExpiresAt: Date | null;
    },
  ): Promise<void>;

  /**
   * After an outbound message: the preview and its author only. The order of the list follows
   * the customer's messages, so neither `lastMessageAt` nor unreadCount changes.
   */
  recordOutbound(id: ContactId, o: { preview: MessagePreview; by: 'admin' | 'ai' }): Promise<void>;

  /** Compare-and-clear: clears the token only if it is still the same. true means the caller may use it. */
  consumeReplyToken(id: ContactId, replyToken: string): Promise<boolean>;

  setAiEnabled(id: ContactId, enabled: boolean): Promise<void>;
  /** Sets needsAdmin true with a reason. If already true, replaces the reason. */
  setNeedsAdmin(id: ContactId, reason: HandoffReason): Promise<void>;
  clearNeedsAdmin(id: ContactId): Promise<void>;
  markRead(id: ContactId): Promise<void>;

  /** Atomic: idle to replying and aiStateAt = now. false if not idle. */
  tryAcquireAiLock(id: ContactId, now: Date): Promise<boolean>;
  releaseAiLock(id: ContactId): Promise<void>;
  /**
   * Atomic: every row that is replying with aiStateAt < staleBefore becomes idle, needsAdmin true,
   * reason ai_timeout. Returns the ids of the rows that changed.
   */
  recoverStuckAiStates(staleBefore: Date): Promise<ContactId[]>;

  list(q: {
    filter: ContactFilter;
    search: string | null;
    before: ContactListCursor | null;
    limit: number;
  }): Promise<{ contacts: Contact[]; next: ContactListCursor | null }>;
  listChangedAfter(after: Seq, limit: number): Promise<{ contacts: Contact[]; hasMore: boolean }>;
  maxUpdatedSeq(): Promise<Seq>;
  countByFilter(): Promise<{ all: number; unread: number; needsAdmin: number }>;
}
