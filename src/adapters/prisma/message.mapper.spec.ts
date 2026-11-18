import { describe, expect, it } from 'vitest';
import type { Message as MessageRow } from './generated/client';
import { toMessage, toNewMessageRow } from './message.mapper';

const row: MessageRow = {
  id: '11111111-0000-7000-8000-000000000001',
  seq: 3n,
  updatedSeq: 5n,
  contactId: '00000000-0000-7000-8000-000000000001',
  direction: 'outbound',
  author: 'admin',
  type: 'text',
  otherKind: null,
  eventCode: null,
  text: 'hi',
  mediaUrl: null,
  previewUrl: null,
  mediaStatus: null,
  stickerPackageId: null,
  stickerId: null,
  lineMessageId: null,
  deliveryStatus: 'failed',
  deliveryError: 'line.push_failed',
  retryKey: '11111111-0000-7000-8000-000000000001',
  createdAt: new Date('2026-11-18T03:00:00.000Z'),
  sentAt: null,
};

describe('message mapper', () => {
  it('maps a row to the entity and back without seq', () => {
    const message = toMessage({ ...row, eventCode: 'contact.followed' });
    expect(message).toEqual({ ...row, eventCode: 'contact.followed' });
    const newRow = toNewMessageRow(message);
    expect(newRow).not.toHaveProperty('seq');
    expect(newRow).not.toHaveProperty('updatedSeq');
    expect({ ...newRow, seq: row.seq, updatedSeq: row.updatedSeq }).toEqual(message);
  });

  it('rejects codes outside the domain lists', () => {
    expect(() => toMessage({ ...row, eventCode: 'nope' })).toThrow('eventCode');
    expect(() => toMessage({ ...row, deliveryError: 'nope' })).toThrow('deliveryError');
  });
});
