import { describe, expect, it } from 'vitest';
import { ADMIN_TEXT_MAX_CHARS, MESSAGE_PAGE_LIMIT } from './limits.contract';
import {
  getMessagesQuerySchema,
  getMessagesResponseSchema,
  sendMessageBodySchema,
} from './messages.contract';

const ID = '0193a000-0000-7000-8000-000000000001';
const UPLOAD = 'AAAAAAAAAAAAAAAAAAAAAA';

describe('getMessagesQuerySchema', () => {
  it('accepts the three modes and converts limit to a number', () => {
    expect(getMessagesQuerySchema.safeParse({}).success).toBe(true);
    expect(getMessagesQuerySchema.safeParse({ beforeSeq: '10' }).success).toBe(true);
    expect(getMessagesQuerySchema.safeParse({ afterUpdatedSeq: '10' }).success).toBe(true);
    const parsed = getMessagesQuerySchema.safeParse({ limit: '20' });
    expect(parsed.success && parsed.data.limit).toBe(20);
  });

  it('rejects both cursors together, bad limits and unknown fields', () => {
    expect(getMessagesQuerySchema.safeParse({ beforeSeq: '1', afterUpdatedSeq: '2' }).success).toBe(
      false,
    );
    expect(getMessagesQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(
      getMessagesQuerySchema.safeParse({ limit: String(MESSAGE_PAGE_LIMIT + 1) }).success,
    ).toBe(false);
    expect(getMessagesQuerySchema.safeParse({ limit: '1.5' }).success).toBe(false);
    expect(getMessagesQuerySchema.safeParse({ beforeSeq: 'x' }).success).toBe(false);
    expect(getMessagesQuerySchema.safeParse({ cursor: '1' }).success).toBe(false);
  });
});

describe('sendMessageBodySchema', () => {
  it('accepts text, image and video bodies', () => {
    const text = sendMessageBodySchema.safeParse({ id: ID, kind: 'text', text: '  hi  ' });
    expect(text.success && 'text' in text.data && text.data.text).toBe('hi');
    expect(
      sendMessageBodySchema.safeParse({
        id: ID,
        kind: 'image',
        uploadId: UPLOAD,
        contentType: 'image/png',
      }).success,
    ).toBe(true);
    expect(
      sendMessageBodySchema.safeParse({
        id: ID,
        kind: 'video',
        uploadId: UPLOAD,
        contentType: 'video/mp4',
      }).success,
    ).toBe(true);
  });

  it('rejects wrong combinations of fields', () => {
    expect(sendMessageBodySchema.safeParse({ id: ID, kind: 'text', text: '   ' }).success).toBe(
      false,
    );
    expect(
      sendMessageBodySchema.safeParse({
        id: ID,
        kind: 'text',
        text: 'x'.repeat(ADMIN_TEXT_MAX_CHARS + 1),
      }).success,
    ).toBe(false);
    expect(
      sendMessageBodySchema.safeParse({ id: ID, kind: 'text', text: 'hi', uploadId: UPLOAD })
        .success,
    ).toBe(false);
    expect(
      sendMessageBodySchema.safeParse({
        id: ID,
        kind: 'image',
        uploadId: UPLOAD,
        contentType: 'image/png',
        text: 'x',
      }).success,
    ).toBe(false);
    expect(
      sendMessageBodySchema.safeParse({ id: ID, kind: 'image', uploadId: UPLOAD }).success,
    ).toBe(false);
    expect(
      sendMessageBodySchema.safeParse({
        id: ID,
        kind: 'image',
        uploadId: UPLOAD,
        contentType: 'video/mp4',
      }).success,
    ).toBe(false);
    expect(
      sendMessageBodySchema.safeParse({
        id: ID,
        kind: 'video',
        uploadId: 'short',
        contentType: 'video/mp4',
      }).success,
    ).toBe(false);
    expect(
      sendMessageBodySchema.safeParse({ id: 'not-a-uuid', kind: 'text', text: 'hi' }).success,
    ).toBe(false);
    expect(sendMessageBodySchema.safeParse({ id: ID, kind: 'sticker' }).success).toBe(false);
  });
});

describe('getMessagesResponseSchema', () => {
  it('allows hasOlder null in polling mode', () => {
    expect(
      getMessagesResponseSchema.safeParse({
        messages: [],
        hasOlder: null,
        hasMore: false,
        highWater: '0',
      }).success,
    ).toBe(true);
  });
});
