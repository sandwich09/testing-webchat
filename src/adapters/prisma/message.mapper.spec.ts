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
  mediaFailure: null,
  mediaDurationMs: null,
  stickerPackageId: null,
  stickerId: null,
  lineMessageId: null,
  webhookEventId: null,
  quotedLineMessageId: null,
  lineSentIds: ['L1', 'L2'],
  deliveryStatus: 'failed',
  deliveryError: 'line.push_failed',
  retryKey: '11111111-0000-7000-8000-000000000001',
  createdAt: new Date('2026-11-18T03:00:00.000Z'),
  sentAt: null,
  deliveryAttemptAt: null,
  firstPushAt: null,
};

describe('message mapper', () => {
  it('maps a row to the entity and back without seq', () => {
    const message = toMessage({ ...row, eventCode: 'contact.followed' });
    // deliveryAttemptAt is a column only; the domain Message does not carry it.
    expect(message).toEqual({
      ...row,
      deliveryAttemptAt: undefined,
      webhookEventId: undefined,
      eventCode: 'contact.followed',
    });
    expect(message).not.toHaveProperty('webhookEventId');
    expect(message).not.toHaveProperty('deliveryAttemptAt');
    const { deliveryAttemptAt, webhookEventId, ...newRow } = toNewMessageRow(message);
    expect(newRow).not.toHaveProperty('seq');
    expect(newRow).not.toHaveProperty('updatedSeq');
    // A new row has no first push: only recordFirstPush sets it.
    expect(newRow).not.toHaveProperty('firstPushAt');
    // Nor any sent ids: only markSent stores them, after LINE answers.
    expect(newRow).not.toHaveProperty('lineSentIds');
    expect({
      ...newRow,
      seq: row.seq,
      updatedSeq: row.updatedSeq,
      firstPushAt: null,
      lineSentIds: row.lineSentIds,
    }).toEqual(message);
    expect(deliveryAttemptAt).toBeNull();
    expect(webhookEventId).toBeNull();
  });

  it('reads the first push time', () => {
    const at = new Date('2026-11-18T03:00:01.000Z');
    expect(toMessage({ ...row, firstPushAt: at }).firstPushAt).toEqual(at);
  });

  it('starts the delivery attempt of a pending row at its createdAt, and of no other row', () => {
    const pending = toMessage({ ...row, deliveryStatus: 'pending', deliveryError: null });
    expect(toNewMessageRow(pending).deliveryAttemptAt).toEqual(row.createdAt);
    const inbound = toMessage({ ...row, direction: 'inbound', deliveryStatus: null });
    expect(toNewMessageRow(inbound).deliveryAttemptAt).toBeNull();
  });

  it('rejects codes outside the domain lists', () => {
    expect(() => toMessage({ ...row, eventCode: 'nope' })).toThrow('eventCode');
    expect(() => toMessage({ ...row, deliveryError: 'nope' })).toThrow('deliveryError');
  });
});
