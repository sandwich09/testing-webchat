import { describe, expect, it } from 'vitest';
import {
  LINE_MAX_PARTS_PER_REQUEST,
  LINE_TEXT_MAX_CHARS,
  REPLY_TOKEN_USABLE_MS,
} from './constants';
import {
  chooseSendChannel,
  previewOf,
  replyTokenExpiry,
  splitLineText,
  toOutboundParts,
} from './line-send.logic';

const at = (iso: string): Date => new Date(iso);

describe('replyTokenExpiry', () => {
  it('adds the usable window to the event time', () => {
    const ts = at('2026-11-18T05:00:00Z');
    expect(replyTokenExpiry(ts, false)?.getTime()).toBe(ts.getTime() + REPLY_TOKEN_USABLE_MS);
  });

  it('returns null on a redelivery', () => {
    expect(replyTokenExpiry(at('2026-11-18T05:00:00Z'), true)).toBeNull();
  });
});

describe('chooseSendChannel', () => {
  const expires = at('2026-11-18T05:00:50Z');

  it('replies while the token is valid', () => {
    expect(
      chooseSendChannel(
        { replyToken: 'tok', replyTokenExpiresAt: expires },
        at('2026-11-18T05:00:49.999Z'),
      ),
    ).toEqual({ channel: 'reply', replyToken: 'tok' });
  });

  it('pushes at the exact expiry instant and after', () => {
    const c = { replyToken: 'tok', replyTokenExpiresAt: expires };
    expect(chooseSendChannel(c, expires)).toEqual({ channel: 'push' });
    expect(chooseSendChannel(c, at('2026-11-18T05:05:00Z'))).toEqual({ channel: 'push' });
  });

  it('pushes without a token or expiry', () => {
    const now = at('2026-11-18T05:00:00Z');
    expect(chooseSendChannel({ replyToken: null, replyTokenExpiresAt: expires }, now)).toEqual({
      channel: 'push',
    });
    expect(chooseSendChannel({ replyToken: 'tok', replyTokenExpiresAt: null }, now)).toEqual({
      channel: 'push',
    });
  });
});

describe('splitLineText', () => {
  it('returns one chunk when within the limit, and none for empty text', () => {
    expect(splitLineText('hello')).toEqual(['hello']);
    expect(splitLineText('abcde', 5)).toEqual(['abcde']);
    expect(splitLineText('')).toEqual([]);
  });

  it('defaults the limit to LINE_TEXT_MAX_CHARS', () => {
    const chunks = splitLineText('a'.repeat(LINE_TEXT_MAX_CHARS + 1));
    expect(chunks.map((c) => c.length)).toEqual([LINE_TEXT_MAX_CHARS, 1]);
  });

  it('splits at the last newline or space before the limit', () => {
    expect(splitLineText('aaa bbb\nccc ddd', 9)).toEqual(['aaa bbb', 'ccc ddd']);
    expect(splitLineText('aaaa bbbb cccc', 10)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('can split at a separator that sits exactly at the limit', () => {
    expect(splitLineText('abcde fghij', 5)).toEqual(['abcde', 'fghij']);
  });

  it('skips a separator at the start of the window and never returns empty chunks', () => {
    const chunks = splitLineText('ab\n\n\ncdefgh', 3);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
    expect(chunks.join('').replaceAll('\n', '')).toBe('abcdefgh');
  });

  it('cuts without separators at a grapheme boundary for Thai text', () => {
    // "ก็" = ก + ไม้ไต่คู้ is one grapheme (2 code units). Limit 3 must not split it.
    const text = 'กก็กก็กก็';
    const chunks = splitLineText(text, 3);
    expect(chunks.join('')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(3);
      expect(chunk.startsWith('็')).toBe(false);
    }
  });

  it('does not split surrogate pairs', () => {
    const text = '😀'.repeat(5);
    const chunks = splitLineText(text, 3);
    expect(chunks).toEqual(['😀', '😀', '😀', '😀', '😀']);
  });

  it('falls back to the limit when one grapheme is longer than the limit', () => {
    const family = '👨‍👩‍👧‍👦'; // one grapheme, 11 code units
    const chunks = splitLineText(`${family}${family}`, 4);
    expect(chunks.join('')).toBe(`${family}${family}`);
    expect(chunks.every((c) => c.length > 0 && c.length <= 4)).toBe(true);
  });
});

describe('toOutboundParts', () => {
  it('splits text into text parts', () => {
    expect(toOutboundParts({ type: 'text', text: 'hi', mediaUrl: null, previewUrl: null })).toEqual(
      [{ type: 'text', text: 'hi' }],
    );
    const long = `${'a'.repeat(LINE_TEXT_MAX_CHARS)} b`;
    expect(
      toOutboundParts({ type: 'text', text: long, mediaUrl: null, previewUrl: null }),
    ).toHaveLength(2);
  });

  it('maps image and video to one part', () => {
    for (const type of ['image', 'video'] as const) {
      expect(
        toOutboundParts({ type, text: null, mediaUrl: 'https://x/o', previewUrl: 'https://x/p' }),
      ).toEqual([{ type, originalUrl: 'https://x/o', previewUrl: 'https://x/p' }]);
    }
  });

  it('throws on bugs: missing data, unsendable type, too many parts', () => {
    expect(() =>
      toOutboundParts({ type: 'text', text: null, mediaUrl: null, previewUrl: null }),
    ).toThrow();
    expect(() =>
      toOutboundParts({ type: 'image', text: null, mediaUrl: null, previewUrl: 'p' }),
    ).toThrow();
    expect(() =>
      toOutboundParts({ type: 'image', text: null, mediaUrl: 'o', previewUrl: null }),
    ).toThrow();
    expect(() =>
      toOutboundParts({ type: 'sticker', text: null, mediaUrl: null, previewUrl: null }),
    ).toThrow();
    const huge = Array.from({ length: LINE_MAX_PARTS_PER_REQUEST + 1 }, () =>
      'a'.repeat(LINE_TEXT_MAX_CHARS),
    ).join(' ');
    expect(() =>
      toOutboundParts({ type: 'text', text: huge, mediaUrl: null, previewUrl: null }),
    ).toThrow();
  });
});

describe('previewOf', () => {
  it('keeps short text and replaces newlines with spaces', () => {
    expect(previewOf({ type: 'text', text: 'a\nb\r\nc\rd' })).toEqual({
      type: 'text',
      text: 'a b c d',
    });
  });

  it('truncates to 100 graphemes at a grapheme boundary', () => {
    const text = 'ก็'.repeat(150);
    const out = previewOf({ type: 'text', text });
    expect(out.text).toBe('ก็'.repeat(100));
    expect(previewOf({ type: 'text', text: 'x'.repeat(100) }).text).toBe('x'.repeat(100));
    expect(previewOf({ type: 'text', text: 'x'.repeat(101) }).text).toBe('x'.repeat(100));
  });

  it('gives null text for other types and for null text', () => {
    expect(previewOf({ type: 'image', text: null })).toEqual({ type: 'image', text: null });
    expect(previewOf({ type: 'sticker', text: 'ignored' })).toEqual({
      type: 'sticker',
      text: null,
    });
    expect(previewOf({ type: 'text', text: null })).toEqual({ type: 'text', text: null });
  });

  it('throws for event messages', () => {
    expect(() => previewOf({ type: 'event', text: null })).toThrow();
  });
});
