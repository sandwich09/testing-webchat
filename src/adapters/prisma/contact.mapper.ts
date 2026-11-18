import type { Contact, ContactId, LineUserId, MessageType, Seq } from '@/core/domain';
import type { Contact as ContactRow, Prisma } from './generated/client';

type LastMessageBy = Contact['lastMessageBy'];
type LastMessageType = Contact['lastMessageType'];

// The columns reuse the MessageAuthor and MessageType enums, which are wider than the entity:
// a contact's last message is never by `system` and never an `event` line.
const toLastMessageBy = (value: ContactRow['lastMessageBy']): LastMessageBy => {
  if (value === 'system') throw new Error('Contact.lastMessageBy cannot be system');
  return value;
};

const toLastMessageType = (value: MessageType | null): LastMessageType => {
  if (value === 'event') throw new Error('Contact.lastMessageType cannot be event');
  return value;
};

/** Database row to domain entity. */
export const toContact = (row: ContactRow): Contact => ({
  id: row.id as ContactId, // brand: id read back from the Contact table
  lineUserId: row.lineUserId as LineUserId, // brand: stored from a LINE userId
  displayName: row.displayName,
  pictureUrl: row.pictureUrl,
  followStatus: row.followStatus,
  followedAt: row.followedAt,
  aiEnabled: row.aiEnabled,
  needsAdmin: row.needsAdmin,
  needsAdminReason: row.needsAdminReason,
  aiState: row.aiState,
  aiStateAt: row.aiStateAt,
  unreadCount: row.unreadCount,
  lastMessageAt: row.lastMessageAt,
  lastMessagePreview: row.lastMessagePreview,
  lastMessageBy: toLastMessageBy(row.lastMessageBy),
  lastMessageType: toLastMessageType(row.lastMessageType),
  replyToken: row.replyToken,
  replyTokenExpiresAt: row.replyTokenExpiresAt,
  createdAt: row.createdAt,
  updatedSeq: row.updatedSeq as Seq, // brand: set from change_seq by the database trigger
});

/** Domain input of `ensure` to the row inserted. Every other column keeps its schema default. */
export const toNewContactRow = (input: {
  id: ContactId;
  lineUserId: LineUserId;
  now: Date;
}): Prisma.ContactCreateManyInput => ({
  id: input.id,
  lineUserId: input.lineUserId,
  followStatus: 'following',
  aiEnabled: false,
  createdAt: input.now,
});
