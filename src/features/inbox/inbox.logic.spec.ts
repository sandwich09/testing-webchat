import { describe, expect, it } from 'vitest';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '@/contracts';
import type { ContactDetailDto, ContactDto, MessageDto } from '@/contracts';
import { copy } from './inbox.constants';
import {
  aiSwitchView,
  buildContactPreview,
  canSend,
  compareContacts,
  composerDisabledReason,
  computeTargetSize,
  formatDayChip,
  formatListTime,
  groupMessagesForDisplay,
  isSubmitKey,
  isWelcomeCard,
  showsAsEventLine,
  linkify,
  matchesContactFilter,
  mergeThread,
  oldestSeq,
  shouldSendTypingPing,
  shouldStickToBottom,
  sniffMediaType,
  sortMessages,
  threadSubline,
  validateAttachment,
  type ThreadMessage,
} from './inbox.logic';

// 2026-11-18 14:32 Thai time (Wednesday)
const NOW = new Date('2026-11-18T07:32:00.000Z');

function contact(over: Partial<ContactDto> = {}): ContactDto {
  return {
    id: 'c1',
    displayName: 'สมชาย',
    pictureUrl: null,
    followStatus: 'following',
    followedAt: null,
    aiEnabled: false,
    needsAdmin: false,
    needsAdminReason: null,
    aiReplying: false,
    unreadCount: 0,
    lastMessage: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedSeq: '1',
    ...over,
  };
}

function detail(over: Partial<ContactDetailDto> = {}): ContactDetailDto {
  return { ...contact(), stats: { messageCount: 0, aiMessageCount: 0 }, ...over };
}

function msg(over: Partial<ThreadMessage> & { id: string }): ThreadMessage {
  return {
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
    quote: null,
    delivery: null,
    createdAt: '2026-11-18T07:00:00.000Z',
    sentAt: null,
    ...over,
  };
}

describe('formatListTime', () => {
  it('shows the time on the same Thai day', () => {
    expect(formatListTime('2026-11-18T07:32:00.000Z', NOW)).toBe('14:32');
    expect(formatListTime('2026-11-17T17:00:00.000Z', NOW)).toBe('00:00'); // midnight Thai time
  });

  it('decides the day in Thai time, not UTC', () => {
    const lateNow = new Date('2026-11-18T18:00:00.000Z'); // 19 Nov 01:00 Thai time
    expect(formatListTime('2026-11-18T15:00:00.000Z', lateNow)).toBe('เมื่อวาน');
  });

  it('shows "yesterday"', () => {
    expect(formatListTime('2026-11-17T10:00:00.000Z', NOW)).toBe('เมื่อวาน');
  });

  it('shows the weekday from 2 to 6 days back', () => {
    // 2026-11-16 is a Monday and 2026-11-12 a Thursday in Bangkok.
    expect(formatListTime('2026-11-16T05:00:00.000Z', NOW)).toBe('จ.');
    expect(formatListTime('2026-11-12T05:00:00.000Z', NOW)).toBe('พฤ.');
    // 18:30 UTC on Saturday 14 Nov is already Sunday 15 Nov in Bangkok.
    expect(formatListTime('2026-11-14T18:30:00.000Z', NOW)).toBe('อา.');
  });

  it('shows the date from 7 days back, with the year when it differs', () => {
    expect(formatListTime('2026-11-11T05:00:00.000Z', NOW)).toBe('11 พ.ย.');
    expect(formatListTime('2026-01-05T05:00:00.000Z', NOW)).toBe('5 ม.ค.');
    expect(formatListTime('2025-11-18T05:00:00.000Z', NOW)).toBe('18 พ.ย. 2568');
  });

  it('shows the time for a time in the future', () => {
    expect(formatListTime('2026-11-20T07:32:00.000Z', NOW)).toBe('14:32');
  });
});

describe('formatDayChip', () => {
  it('names today and yesterday', () => {
    expect(formatDayChip('2026-11-18', NOW)).toBe('วันนี้');
    expect(formatDayChip('2026-11-17', NOW)).toBe('เมื่อวาน');
  });

  it('shows the date, with the year when it differs', () => {
    expect(formatDayChip('2026-11-10', NOW)).toBe('10 พ.ย.');
    expect(formatDayChip('2025-12-31', NOW)).toBe('31 ธ.ค. 2568');
  });
});

describe('sortMessages and oldestSeq', () => {
  it('sorts by seq as numbers and puts rows without seq last by createdAt', () => {
    const rows = [
      msg({ id: 'local2', seq: null, updatedSeq: null, createdAt: '2026-11-18T07:02:00.000Z' }),
      msg({ id: 'ten', seq: '10' }),
      msg({ id: 'local1', seq: null, updatedSeq: null, createdAt: '2026-11-18T07:01:00.000Z' }),
      msg({ id: 'nine', seq: '9' }),
    ];
    expect(sortMessages(rows).map((r) => r.id)).toEqual(['nine', 'ten', 'local1', 'local2']);
  });

  it('finds the lowest seq that is not null', () => {
    expect(oldestSeq([])).toBeUndefined();
    expect(oldestSeq([msg({ id: 'a', seq: null }), msg({ id: 'b', seq: '12' })])).toBe('12');
    expect(oldestSeq([msg({ id: 'a', seq: '100' }), msg({ id: 'b', seq: '9' })])).toBe('9');
  });
});

describe('mergeThread', () => {
  it('replaces a local row with the server row and clears the local state', () => {
    const local = msg({
      id: 'm1',
      seq: null,
      updatedSeq: null,
      localState: 'unconfirmed',
      localError: 'x',
    });
    const server: MessageDto = { ...msg({ id: 'm1', seq: '5', updatedSeq: '5' }) } as MessageDto;
    const merged = mergeThread([local], [server]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'm1', seq: '5', updatedSeq: '5' });
    expect(merged[0]?.localState).toBeUndefined();
    expect(merged[0]?.localError).toBeUndefined();
  });

  it('keeps the local preview until the server has a preview url', () => {
    const local = msg({
      id: 'm1',
      seq: null,
      updatedSeq: null,
      localState: 'sending',
      localPreviewUrl: 'blob:abc',
    });
    const noPreview = msg({
      id: 'm1',
      seq: '5',
      updatedSeq: '5',
      type: 'image',
      media: { status: 'ready', url: null, previewUrl: null },
    }) as MessageDto;
    expect(mergeThread([local], [noPreview])[0]?.localPreviewUrl).toBe('blob:abc');
    const withPreview = {
      ...noPreview,
      updatedSeq: '6',
      media: { status: 'ready', url: 'u', previewUrl: 'p' },
    } as MessageDto;
    const merged = mergeThread(mergeThread([local], [noPreview]), [withPreview]);
    expect(merged[0]?.localPreviewUrl).toBeUndefined();
  });

  it('keeps rows that are not in incoming and sorts the result', () => {
    const failed = msg({
      id: 'f',
      seq: null,
      updatedSeq: null,
      localState: 'failed',
      createdAt: '2026-11-18T08:00:00.000Z',
    });
    const a = msg({ id: 'a', seq: '2', updatedSeq: '2' });
    const b = msg({ id: 'b', seq: '1', updatedSeq: '1' }) as MessageDto;
    expect(mergeThread([failed, a], [b]).map((r) => r.id)).toEqual(['b', 'a', 'f']);
  });

  it('does not take an older server row over a newer one', () => {
    const current = msg({ id: 'a', seq: '2', updatedSeq: '9', text: 'new' });
    const stale = msg({ id: 'a', seq: '2', updatedSeq: '3', text: 'old' }) as MessageDto;
    const merged = mergeThread([current], [stale]);
    expect(merged[0]?.text).toBe('new');
  });

  it('returns the same array when nothing changed', () => {
    const current = [
      msg({ id: 'a', seq: '1', updatedSeq: '1' }),
      msg({ id: 'b', seq: '2', updatedSeq: '2' }),
    ];
    expect(mergeThread(current, [])).toBe(current);
    expect(mergeThread(current, [current[0] as MessageDto])).toBe(current);
  });
});

describe('groupMessagesForDisplay', () => {
  it('shows rich menu taps as event lines and the welcome card as its own item', () => {
    const items = [
      msg({ id: 'w', seq: '1', author: 'ai', direction: 'outbound', eventCode: 'welcome.sent' }),
      msg({ id: 't1', seq: '2', text: 'คุยกับ AI', eventCode: 'customer.tapped_ai_on' }),
      msg({ id: 'r', seq: '3', author: 'ai', direction: 'outbound', text: 'สวัสดี' }),
      msg({ id: 't2', seq: '4', text: 'วิธีทดสอบ', eventCode: 'customer.tapped_how_to' }),
      msg({ id: 'x', seq: '5', text: 'คุยกับ AI' }),
    ];
    expect(groupMessagesForDisplay(items, NOW).map((i) => [i.kind, i.key])).toEqual([
      ['day', 'day-2026-11-18'],
      ['welcome', 'w'],
      ['event', 't1'],
      ['group', 'r'],
      ['event', 't2'],
      ['group', 'x'],
    ]);
  });

  it('tells event lines and the welcome card apart from other messages', () => {
    expect(showsAsEventLine({ type: 'event', eventCode: 'guard.blocked' })).toBe(true);
    expect(showsAsEventLine({ type: 'text', eventCode: 'customer.tapped_admin' })).toBe(true);
    expect(showsAsEventLine({ type: 'text', eventCode: null })).toBe(false);
    expect(showsAsEventLine({ type: 'text', eventCode: 'welcome.sent' })).toBe(false);
    expect(isWelcomeCard({ direction: 'outbound', eventCode: 'welcome.sent' })).toBe(true);
    expect(isWelcomeCard({ direction: 'inbound', eventCode: 'welcome.sent' })).toBe(false);
    expect(isWelcomeCard({ direction: 'outbound', eventCode: null })).toBe(false);
  });

  it('adds a day chip before each Thai day', () => {
    const items = [
      msg({ id: 'a', seq: '1', createdAt: '2026-11-17T08:00:00.000Z' }),
      msg({ id: 'b', seq: '2', createdAt: '2026-11-18T07:00:00.000Z' }),
    ];
    const out = groupMessagesForDisplay(items, NOW);
    expect(out.map((i) => i.kind)).toEqual(['day', 'group', 'day', 'group']);
    expect(out[0]).toMatchObject({ key: 'day-2026-11-17', label: 'เมื่อวาน' });
    expect(out[2]).toMatchObject({ key: 'day-2026-11-18', label: 'วันนี้' });
  });

  it('groups consecutive messages by the same author within the gap', () => {
    const items = [
      msg({ id: 'a', seq: '1', createdAt: '2026-11-18T07:00:00.000Z' }),
      msg({ id: 'b', seq: '2', createdAt: '2026-11-18T07:04:59.000Z' }),
      msg({ id: 'c', seq: '3', createdAt: '2026-11-18T07:10:00.000Z' }),
    ];
    const groups = groupMessagesForDisplay(items, NOW).filter((i) => i.kind === 'group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: 'a' });
    expect(groups[0]?.kind === 'group' && groups[0].messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('splits admin and AI into different groups', () => {
    const items = [
      msg({ id: 'a', seq: '1', author: 'admin', direction: 'outbound' }),
      msg({ id: 'b', seq: '2', author: 'ai', direction: 'outbound' }),
    ];
    expect(groupMessagesForDisplay(items, NOW).filter((i) => i.kind === 'group')).toHaveLength(2);
  });

  it('places an event line at its seq and breaks the group', () => {
    const items = [
      msg({ id: 'a', seq: '1' }),
      msg({
        id: 'e',
        seq: '2',
        type: 'event',
        author: 'system',
        text: null,
        eventCode: 'contact.followed',
      }),
      msg({ id: 'b', seq: '3' }),
    ];
    const out = groupMessagesForDisplay(items, NOW);
    expect(out.map((i) => i.kind)).toEqual(['day', 'group', 'event', 'group']);
    expect(out[2]).toMatchObject({ kind: 'event', key: 'e' });
  });

  it('skips an event with an unknown code', () => {
    const items = [
      msg({ id: 'a', seq: '1' }),
      msg({
        id: 'e',
        seq: '2',
        type: 'event',
        author: 'system',
        text: null,
        eventCode: 'nope.nope' as never,
      }),
      msg({ id: 'b', seq: '3' }),
    ];
    const out = groupMessagesForDisplay(items, NOW);
    expect(out.map((i) => i.kind)).toEqual(['day', 'group']);
    expect(out[1]?.kind === 'group' && out[1].messages).toHaveLength(2);
  });

  it('returns nothing for an empty thread', () => {
    expect(groupMessagesForDisplay([], NOW)).toEqual([]);
  });
});

describe('matchesContactFilter', () => {
  it('applies the filter', () => {
    expect(matchesContactFilter(contact(), 'all', '')).toBe(true);
    expect(matchesContactFilter(contact({ unreadCount: 0 }), 'unread', '')).toBe(false);
    expect(matchesContactFilter(contact({ unreadCount: 2 }), 'unread', '')).toBe(true);
    expect(matchesContactFilter(contact(), 'needs_admin', '')).toBe(false);
    expect(matchesContactFilter(contact({ needsAdmin: true }), 'needs_admin', '')).toBe(true);
  });

  it('searches the name without case', () => {
    expect(matchesContactFilter(contact({ displayName: 'Somchai' }), 'all', 'SOM')).toBe(true);
    expect(matchesContactFilter(contact({ displayName: 'Somchai' }), 'all', 'xyz')).toBe(false);
    expect(matchesContactFilter(contact({ displayName: null }), 'all', 'a')).toBe(false);
    expect(matchesContactFilter(contact({ displayName: null }), 'all', '')).toBe(true);
  });

  it('applies the filter and the search together', () => {
    expect(
      matchesContactFilter(contact({ displayName: 'Ann', unreadCount: 0 }), 'unread', 'ann'),
    ).toBe(false);
  });
});

describe('compareContacts', () => {
  it('keeps a contact in place when only its preview changed to a reply of the shop', () => {
    // `lastMessage.at` is the customer's latest message time, so an admin reply keeps it.
    const older = contact({
      id: 'older',
      lastMessage: { at: '2026-11-18T07:00:00.000Z', by: 'admin', type: 'text', text: 'ตอบ' },
    });
    const newer = contact({
      id: 'newer',
      lastMessage: { at: '2026-11-18T07:05:00.000Z', by: 'customer', type: 'text', text: 'ถาม' },
    });
    expect([older, newer].sort(compareContacts).map((x) => x.id)).toEqual(['newer', 'older']);
  });

  it('orders by the sort time then id, newest first', () => {
    const a = contact({
      id: 'a',
      lastMessage: { at: '2026-11-18T07:00:00.000Z', by: 'customer', type: 'text', text: 'x' },
    });
    const b = contact({ id: 'b', createdAt: '2026-11-18T08:00:00.000Z' });
    const c = contact({ id: 'c', createdAt: '2026-11-18T08:00:00.000Z' });
    expect([a, b, c].sort(compareContacts).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(compareContacts(a, a)).toBe(0);
  });
});

describe('shouldStickToBottom', () => {
  it('is true within the threshold', () => {
    expect(shouldStickToBottom({ scrollTop: 920, scrollHeight: 2000, clientHeight: 1000 })).toBe(
      true,
    );
    expect(shouldStickToBottom({ scrollTop: 919, scrollHeight: 2000, clientHeight: 1000 })).toBe(
      false,
    );
    expect(shouldStickToBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 })).toBe(true);
    expect(
      shouldStickToBottom({ scrollTop: 500, scrollHeight: 2000, clientHeight: 1000 }, 600),
    ).toBe(true);
  });
});

describe('buildContactPreview', () => {
  const last = (over: Partial<NonNullable<ContactDto['lastMessage']>>) => ({
    at: '2026-11-18T07:00:00.000Z',
    by: 'customer' as const,
    type: 'text' as const,
    text: 'สวัสดี',
    ...over,
  });

  it('shows the unfollowed text', () => {
    expect(
      buildContactPreview(contact({ followStatus: 'unfollowed', lastMessage: last({}) })),
    ).toEqual({
      prefix: null,
      prefixTone: 'muted',
      text: copy.contact.unfollowed,
    });
  });

  it('prefixes waiting contacts with the warn tone', () => {
    expect(buildContactPreview(contact({ needsAdmin: true, lastMessage: last({}) }))).toEqual({
      prefix: copy.preview.needsAdmin,
      prefixTone: 'warn',
      text: 'สวัสดี',
    });
  });

  it('prefixes admin and AI messages', () => {
    expect(buildContactPreview(contact({ lastMessage: last({ by: 'admin' }) })).prefix).toBe(
      copy.preview.you,
    );
    expect(buildContactPreview(contact({ lastMessage: last({ by: 'ai' }) })).prefix).toBe(
      copy.preview.ai,
    );
    expect(buildContactPreview(contact({ lastMessage: last({}) })).prefix).toBeNull();
  });

  it('uses the media words and collapses line breaks', () => {
    expect(
      buildContactPreview(contact({ lastMessage: last({ type: 'image', text: null }) })).text,
    ).toBe(copy.media.image);
    expect(
      buildContactPreview(contact({ lastMessage: last({ type: 'video', text: null }) })).text,
    ).toBe(copy.media.video);
    expect(
      buildContactPreview(contact({ lastMessage: last({ type: 'sticker', text: null }) })).text,
    ).toBe(copy.media.sticker);
    expect(
      buildContactPreview(contact({ lastMessage: last({ type: 'other', text: null }) })).text,
    ).toBe(copy.media.other.unknown);
    expect(buildContactPreview(contact({ lastMessage: last({ text: 'a\nb\r\n\nc' }) })).text).toBe(
      'a b c',
    );
  });

  it('shows "no messages" without a last message', () => {
    expect(buildContactPreview(contact()).text).toBe(copy.preview.none);
  });
});

describe('aiSwitchView and threadSubline', () => {
  it('follows the table of ui-screens 5.2', () => {
    expect(aiSwitchView(detail({ aiEnabled: true }), false)).toEqual({
      checked: false,
      disabled: true,
      label: copy.ai.labelKilled,
      note: copy.ai.noteKilled,
    });
    expect(
      aiSwitchView(detail({ aiEnabled: true, followStatus: 'unfollowed' }), true),
    ).toMatchObject({
      checked: false,
      disabled: true,
      label: copy.ai.label,
      note: copy.ai.noteUnfollowed,
    });
    expect(aiSwitchView(detail({ aiEnabled: true }), true)).toMatchObject({
      checked: true,
      disabled: false,
      note: copy.ai.noteOn,
    });
    expect(aiSwitchView(detail({ aiEnabled: false }), true)).toMatchObject({
      checked: false,
      disabled: false,
      note: copy.ai.noteOff,
    });
  });

  it('builds the sub line', () => {
    expect(threadSubline(detail({ needsAdmin: true, aiEnabled: true }), true)).toEqual({
      follow: copy.thread.following,
      ai: copy.thread.needsAdmin,
      aiTone: 'warn',
    });
    expect(threadSubline(detail({ aiEnabled: true }), true).ai).toBe(copy.thread.aiHelping);
    expect(threadSubline(detail({ aiEnabled: true }), false).ai).toBeNull();
    expect(threadSubline(detail({ followStatus: 'unfollowed' }), true)).toMatchObject({
      follow: copy.contact.unfollowed,
      ai: null,
    });
  });
});

describe('composer logic', () => {
  it('finds why the composer is closed, LINE first', () => {
    expect(composerDisabledReason(detail(), true)).toBeNull();
    expect(composerDisabledReason(detail({ followStatus: 'unfollowed' }), true)).toBe('unfollowed');
    expect(composerDisabledReason(detail(), false)).toBe('line_not_configured');
    expect(composerDisabledReason(detail({ followStatus: 'unfollowed' }), false)).toBe(
      'line_not_configured',
    );
  });

  it('submits on a plain Enter only', () => {
    const base = { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 };
    expect(isSubmitKey(base)).toBe(true);
    expect(isSubmitKey({ ...base, shiftKey: true })).toBe(false);
    expect(isSubmitKey({ ...base, isComposing: true })).toBe(false);
    expect(isSubmitKey({ ...base, keyCode: 229 })).toBe(false);
    expect(isSubmitKey({ ...base, key: 'a' })).toBe(false);
  });

  it('decides when sending is possible', () => {
    expect(canSend('hi', { status: 'idle' }, null)).toBe(true);
    expect(canSend('  \n', { status: 'idle' }, null)).toBe(false);
    expect(canSend('', { status: 'ready' }, null)).toBe(true);
    expect(canSend('hi', { status: 'uploading' }, null)).toBe(false);
    expect(canSend('hi', { status: 'converting' }, null)).toBe(false);
    expect(canSend('hi', { status: 'idle' }, 'unfollowed')).toBe(false);
    expect(canSend('', { status: 'ready' }, 'line_not_configured')).toBe(false);
    expect(canSend('hi', { status: 'rejected' }, null)).toBe(true);
  });

  it('pings typing at the interval', () => {
    expect(shouldSendTypingPing(null, 0, 15000)).toBe(true);
    expect(shouldSendTypingPing(1000, 15999, 15000)).toBe(false);
    expect(shouldSendTypingPing(1000, 16000, 15000)).toBe(true);
  });
});

describe('linkify', () => {
  it('returns plain text as one segment', () => {
    expect(linkify('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(linkify('')).toEqual([]);
  });

  it('links http and https only', () => {
    expect(linkify('see https://a.com/x ok')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://a.com/x', href: 'https://a.com/x' },
      { kind: 'text', text: ' ok' },
    ]);
    expect(linkify('ftp://a.com javascript:alert(1) www.a.com')).toEqual([
      { kind: 'text', text: 'ftp://a.com javascript:alert(1) www.a.com' },
    ]);
  });

  it('keeps trailing punctuation out of the link', () => {
    expect(linkify('(http://a.com/x).')).toEqual([
      { kind: 'text', text: '(' },
      { kind: 'link', text: 'http://a.com/x', href: 'http://a.com/x' },
      { kind: 'text', text: ').' },
    ]);
    expect(linkify('http://a.com, https://b.com]')).toEqual([
      { kind: 'link', text: 'http://a.com', href: 'http://a.com' },
      { kind: 'text', text: ', ' },
      { kind: 'link', text: 'https://b.com', href: 'https://b.com' },
      { kind: 'text', text: ']' },
    ]);
  });

  it('stops a link at Thai text', () => {
    expect(linkify('ดูhttps://a.comครับ')).toEqual([
      { kind: 'text', text: 'ดู' },
      { kind: 'link', text: 'https://a.com', href: 'https://a.com' },
      { kind: 'text', text: 'ครับ' },
    ]);
  });

  it('does not link a bare scheme', () => {
    expect(linkify('https://')).toEqual([{ kind: 'text', text: 'https://' }]);
  });
});

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
const ftyp = (brand: string) => bytes(0, 0, 0, 24, ...ascii('ftyp'), ...ascii(brand), 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const WEBP = bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'));

describe('sniffMediaType', () => {
  it('detects images', () => {
    expect(sniffMediaType(JPEG)).toBe('jpeg');
    expect(sniffMediaType(PNG)).toBe('png');
    expect(sniffMediaType(WEBP)).toBe('webp');
    expect(sniffMediaType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')))).toBe('unknown');
  });

  it('detects ISO BMFF brands', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'msf1']) {
      expect(sniffMediaType(ftyp(brand)), brand).toBe('heic');
    }
    expect(sniffMediaType(ftyp('qt  '))).toBe('mov');
    for (const brand of ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ']) {
      expect(sniffMediaType(ftyp(brand)), brand).toBe('mp4');
    }
  });

  // A 1080p H.264 file with the major brand iso5 was turned away on production.
  it('reads any other video brand as MPEG-4, as the server does', () => {
    for (const brand of ['iso4', 'iso5', 'iso6', 'mp4v', 'dash', 'abcd']) {
      expect(sniffMediaType(ftyp(brand)), brand).toBe('mp4');
    }
  });

  it('does not take audio-only MPEG-4 or AVIF for a video', () => {
    for (const brand of ['M4A ', 'M4B ', 'avif', 'avis']) {
      expect(sniffMediaType(ftyp(brand)), brand).toBe('unknown');
    }
  });

  it('gives unknown for short or unrelated data', () => {
    expect(sniffMediaType(new Uint8Array())).toBe('unknown');
    expect(sniffMediaType(bytes(0xff, 0xd8))).toBe('unknown');
    expect(sniffMediaType(bytes(...ascii('%PDF-1.7')))).toBe('unknown');
  });
});

describe('validateAttachment', () => {
  const file = (size: number, name = 'a.jpg', type = 'image/jpeg') => ({ name, type, size });

  it('rejects an empty file first', () => {
    expect(validateAttachment(file(0), JPEG)).toEqual({ ok: false, code: 'empty_file' });
  });

  it('accepts JPEG and PNG without conversion', () => {
    expect(validateAttachment(file(1000), JPEG)).toEqual({
      ok: true,
      kind: 'image',
      needsConversion: false,
      sourceType: 'jpeg',
    });
    expect(validateAttachment(file(1000), PNG)).toMatchObject({ ok: true, needsConversion: false });
  });

  it('marks HEIC and WebP for conversion', () => {
    expect(validateAttachment(file(1000, 'a.heic', ''), ftyp('heic'))).toEqual({
      ok: true,
      kind: 'image',
      needsConversion: true,
      sourceType: 'heic',
    });
    expect(validateAttachment(file(1000, 'a.webp', 'image/webp'), WEBP)).toMatchObject({
      ok: true,
      needsConversion: true,
      sourceType: 'webp',
    });
  });

  it('accepts MP4 as a video', () => {
    expect(validateAttachment(file(1000, 'a.mp4', 'video/mp4'), ftyp('isom'))).toEqual({
      ok: true,
      kind: 'video',
      needsConversion: false,
      sourceType: 'mp4',
    });
  });

  it('rejects MOV and unknown content whatever the name says', () => {
    expect(validateAttachment(file(1000, 'a.mp4', 'video/mp4'), ftyp('qt  '))).toEqual({
      ok: false,
      code: 'mov_not_supported',
    });
    expect(
      validateAttachment(file(1000, 'a.jpg', 'image/jpeg'), bytes(...ascii('%PDF-1.7'))),
    ).toEqual({
      ok: false,
      code: 'unsupported_type',
    });
  });

  it('limits the size by kind', () => {
    expect(validateAttachment(file(IMAGE_MAX_BYTES), JPEG)).toMatchObject({ ok: true });
    expect(validateAttachment(file(IMAGE_MAX_BYTES + 1), JPEG)).toEqual({
      ok: false,
      code: 'image_too_large',
      sizeMb: '10.0',
    });
    expect(validateAttachment(file(VIDEO_MAX_BYTES), ftyp('mp42'))).toMatchObject({ ok: true });
    expect(validateAttachment(file(VIDEO_MAX_BYTES * 1.5), ftyp('mp42'))).toEqual({
      ok: false,
      code: 'video_too_large',
      sizeMb: '75.0',
    });
  });
});

describe('computeTargetSize', () => {
  it('scales the long side down and keeps the ratio', () => {
    expect(computeTargetSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(computeTargetSize(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it('never enlarges', () => {
    expect(computeTargetSize(100, 50, 480)).toEqual({ width: 100, height: 50 });
    expect(computeTargetSize(480, 480, 480)).toEqual({ width: 480, height: 480 });
  });

  it('rounds and keeps at least one pixel', () => {
    expect(computeTargetSize(1000, 3, 100)).toEqual({ width: 100, height: 1 });
    expect(computeTargetSize(1001, 667, 500)).toEqual({ width: 500, height: 333 });
  });
});
