import { describe, expect, it } from 'vitest';

import { copy } from './inbox.constants';
import type { ThreadMessage } from './inbox.logic';
import {
  deliveryReason,
  failedLineText,
  fillCopy,
  newMessages,
  otherLabel,
  planTailScroll,
  resolveMedia,
  restoredScrollTop,
  shouldLoadOlder,
} from './inbox.thread.logic';

function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: 'm1',
    seq: '1',
    updatedSeq: '1',
    contactId: 'c1',
    direction: 'inbound',
    author: 'customer',
    type: 'text',
    text: 'hi',
    media: null,
    sticker: null,
    otherKind: null,
    eventCode: null,
    delivery: null,
    createdAt: '2026-11-18T07:00:00.000Z',
    sentAt: null,
    ...overrides,
  };
}

describe('newMessages', () => {
  const items = [message({ id: 'a' }), message({ id: 'b' }), message({ id: 'c' })];

  it('returns the unseen rows below the first seen row', () => {
    expect(newMessages(items, new Set(['a'])).map((m) => m.id)).toEqual(['b', 'c']);
    expect(newMessages(items, new Set(['a', 'b', 'c']))).toEqual([]);
  });

  it('does not count an older page above the seen rows', () => {
    expect(newMessages(items, new Set(['c']))).toEqual([]);
  });

  it('finds a message that sorted before a row the admin just sent', () => {
    const rows = [message({ id: 'a' }), message({ id: 'new' }), message({ id: 'sending' })];
    expect(newMessages(rows, new Set(['a', 'sending'])).map((m) => m.id)).toEqual(['new']);
  });

  it('counts nothing as new on the first render', () => {
    expect(newMessages(items, new Set())).toEqual([]);
  });
});

describe('planTailScroll', () => {
  const inbound = message({ id: 'in' });
  const outboundSending = message({
    id: 'out',
    direction: 'outbound',
    author: 'admin',
    localState: 'sending',
  });
  const outboundFromServer = message({ id: 'srv', direction: 'outbound', author: 'ai' });

  it('does nothing when nothing arrived', () => {
    expect(planTailScroll([], true, true)).toEqual({
      scroll: false,
      showButton: false,
      markRead: false,
      inbound: false,
    });
  });

  it('follows new messages when the reader is at the bottom and clears unread when visible', () => {
    expect(planTailScroll([inbound], true, true)).toEqual({
      scroll: true,
      showButton: false,
      markRead: true,
      inbound: true,
    });
  });

  it('does not clear unread while the tab is hidden', () => {
    expect(planTailScroll([inbound], true, false).markRead).toBe(false);
  });

  it('shows the button and leaves the position when the reader scrolled up', () => {
    expect(planTailScroll([inbound], false, true)).toEqual({
      scroll: false,
      showButton: true,
      markRead: false,
      inbound: true,
    });
  });

  it('always scrolls for a message the admin just sent', () => {
    expect(planTailScroll([outboundSending], false, true)).toEqual({
      scroll: true,
      showButton: false,
      markRead: false,
      inbound: false,
    });
  });

  it('does not clear unread for outbound rows from the server', () => {
    expect(planTailScroll([outboundFromServer], true, true).markRead).toBe(false);
  });
});

describe('shouldLoadOlder', () => {
  it('loads within the threshold when more exist', () => {
    expect(shouldLoadOlder({ scrollTop: 200, hasOlder: true, fetching: false })).toBe(true);
    expect(shouldLoadOlder({ scrollTop: 201, hasOlder: true, fetching: false })).toBe(false);
  });

  it('does not load without older messages or while a request runs', () => {
    expect(shouldLoadOlder({ scrollTop: 0, hasOlder: false, fetching: false })).toBe(false);
    expect(shouldLoadOlder({ scrollTop: 0, hasOlder: true, fetching: true })).toBe(false);
  });

  it('takes a custom threshold', () => {
    expect(
      shouldLoadOlder({ scrollTop: 50, hasOlder: true, fetching: false, thresholdPx: 10 }),
    ).toBe(false);
  });
});

describe('restoredScrollTop', () => {
  it('moves down by the height that was added above', () => {
    expect(restoredScrollTop({ scrollTop: 40, scrollHeight: 1000 }, 1600)).toBe(640);
  });

  it('keeps the position when the height did not change', () => {
    expect(restoredScrollTop({ scrollTop: 40, scrollHeight: 1000 }, 1000)).toBe(40);
  });
});

describe('resolveMedia', () => {
  const ready = {
    status: 'ready',
    url: 'https://x/full.jpg',
    previewUrl: 'https://x/p.jpg',
  } as const;

  it('shows the preview of a ready image and allows the lightbox', () => {
    expect(resolveMedia(message({ type: 'image', media: ready }))).toEqual({
      kind: 'image',
      state: 'picture',
      src: 'https://x/p.jpg',
      openable: true,
    });
  });

  it('falls back to the original when a ready file has no preview', () => {
    expect(resolveMedia(message({ type: 'video', media: { ...ready, previewUrl: null } }))).toEqual(
      { kind: 'video', state: 'picture', src: 'https://x/full.jpg', openable: true },
    );
  });

  it('treats a ready file without any URL as failed', () => {
    expect(
      resolveMedia(
        message({ type: 'image', media: { status: 'ready', url: null, previewUrl: null } }),
      ),
    ).toMatchObject({ state: 'failed', openable: false });
  });

  it('shows the skeleton while a received file is pending', () => {
    expect(
      resolveMedia(
        message({ type: 'image', media: { status: 'pending', url: null, previewUrl: null } }),
      ),
    ).toEqual({ kind: 'image', state: 'pending', src: null, openable: false });
  });

  it('shows the local preview of a file being sent, without the lightbox', () => {
    expect(
      resolveMedia(
        message({
          type: 'image',
          direction: 'outbound',
          media: { status: 'pending', url: null, previewUrl: null },
          localPreviewUrl: 'blob:local',
        }),
      ),
    ).toEqual({ kind: 'image', state: 'picture', src: 'blob:local', openable: false });
  });

  it('maps failed and too_large', () => {
    const base = { url: null, previewUrl: null };
    expect(
      resolveMedia(message({ type: 'video', media: { status: 'failed', ...base } })),
    ).toMatchObject({ kind: 'video', state: 'failed' });
    expect(
      resolveMedia(message({ type: 'image', media: { status: 'too_large', ...base } })),
    ).toMatchObject({ kind: 'image', state: 'too_large' });
  });

  it('treats an image row without media as failed', () => {
    expect(resolveMedia(message({ type: 'image', media: null }))).toMatchObject({
      state: 'failed',
    });
  });

  it('resolves stickers and other kinds, and nothing for text and events', () => {
    expect(
      resolveMedia(
        message({ type: 'sticker', sticker: { packageId: '1', stickerId: '2', imageUrl: 'u' } }),
      ),
    ).toEqual({ kind: 'sticker', src: 'u' });
    expect(resolveMedia(message({ type: 'sticker', sticker: null }))).toEqual({
      kind: 'sticker',
      src: null,
    });
    expect(resolveMedia(message({ type: 'other', otherKind: 'audio' }))).toEqual({
      kind: 'other',
      label: copy.media.other.audio,
    });
    expect(resolveMedia(message({ type: 'text' }))).toBeNull();
    expect(resolveMedia(message({ type: 'event' }))).toBeNull();
  });
});

describe('otherLabel', () => {
  it('maps each kind and falls back to unknown', () => {
    expect(otherLabel('file')).toBe(copy.media.other.file);
    expect(otherLabel('location')).toBe(copy.media.other.location);
    expect(otherLabel(null)).toBe(copy.media.other.unknown);
    expect(otherLabel('video-call')).toBe(copy.media.other.unknown);
  });
});

describe('deliveryReason and failedLineText', () => {
  it('drops the leading "ส่งไม่สำเร็จ" that the catalog text already has', () => {
    expect(deliveryReason('line.quota_exceeded')).toBe('โควตาข้อความของ LINE เต็ม');
    expect(failedLineText('line.quota_exceeded')).toBe(
      `${copy.message.failed} · โควตาข้อความของ LINE เต็ม`,
    );
  });

  it('keeps a reason that does not start with it', () => {
    expect(deliveryReason('client.network')).toBe('เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
    expect(deliveryReason('media.too_large')).toBe('ไฟล์ใหญ่เกินไป แนบไฟล์ที่เล็กกว่า');
  });

  it('shows only the failed word without a usable code', () => {
    expect(failedLineText(null)).toBe(copy.message.failed);
    expect(failedLineText('not.a.code')).toBe(copy.message.failed);
    // The catalog shows no text for this code.
    expect(failedLineText('line.content_unavailable')).toBe(copy.message.failed);
  });
});

describe('fillCopy', () => {
  it('replaces known placeholders and keeps unknown ones', () => {
    expect(fillCopy(copy.info.timesValue, { n: 1234 })).toBe('1234 ครั้ง');
    expect(fillCopy('{a} {b}', { a: 'x' })).toBe('x {b}');
  });
});
