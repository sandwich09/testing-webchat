import { describe, expect, it } from 'vitest';
import { toContact } from './contact.mapper';
import type { Contact as ContactRow } from './generated/client';

const row: ContactRow = {
  id: '00000000-0000-7000-8000-000000000001',
  lineUserId: 'U00000000000000000000000000000001',
  displayName: null,
  pictureUrl: null,
  followStatus: 'following',
  followedAt: null,
  followStatusAt: null,
  aiEnabled: false,
  needsAdmin: false,
  needsAdminReason: null,
  aiState: 'idle',
  aiStateAt: null,
  unreadCount: 0,
  lastMessageAt: null,
  lastMessagePreview: null,
  lastMessageBy: null,
  lastMessageType: null,
  replyToken: null,
  replyTokenExpiresAt: null,
  createdAt: new Date('2026-11-18T03:00:00.000Z'),
  updatedSeq: 7n,
};

describe('toContact', () => {
  it('maps a row to the entity', () => {
    // followStatusAt is a column only: setFollowStatus compares it; the entity does not carry it.
    const entity: Partial<typeof row> = { ...row };
    delete entity.followStatusAt;
    expect(toContact(row)).toEqual(entity);
  });

  it('rejects last-message values the entity cannot hold', () => {
    expect(() => toContact({ ...row, lastMessageBy: 'system' })).toThrow('system');
    expect(() => toContact({ ...row, lastMessageType: 'event' })).toThrow('event');
  });
});
