import type { AiState, FollowStatus, HandoffReason, MessageType } from './enums.model';
import type { ContactId, LineUserId, Seq } from './ids';

export interface Contact {
  id: ContactId;
  lineUserId: LineUserId;
  displayName: string | null;
  pictureUrl: string | null;
  followStatus: FollowStatus;
  followedAt: Date | null;
  /** Per-contact AI switch. Remembered even while the kill switch is off. */
  aiEnabled: boolean;
  needsAdmin: boolean;
  needsAdminReason: HandoffReason | null;
  aiState: AiState;
  aiStateAt: Date | null;
  unreadCount: number;
  lastMessageAt: Date | null;
  /** At most PREVIEW_TEXT_MAX_CHARS characters, or null when the last message is media. */
  lastMessagePreview: string | null;
  lastMessageBy: 'customer' | 'admin' | 'ai' | null;
  lastMessageType: Exclude<MessageType, 'event'> | null;
  replyToken: string | null;
  replyTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedSeq: Seq;
}
