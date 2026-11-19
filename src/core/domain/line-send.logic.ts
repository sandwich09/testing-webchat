import {
  LINE_MAX_PARTS_PER_REQUEST,
  LINE_RETRY_KEY_WINDOW_MS,
  LINE_TEXT_MAX_CHARS,
  PREVIEW_TEXT_MAX_CHARS,
  REPLY_TOKEN_USABLE_MS,
} from './constants';
import type { Contact } from './contact.model';
import type { LineSecretStatus, MessageType } from './enums.model';
import type { OutboundLinePart } from './line-event.model';
import type { Message } from './message.model';
import type { Settings } from './settings.model';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Start offsets of every grapheme in `text`, followed by `text.length`. */
const graphemeBoundaries = (text: string): number[] => {
  const bounds: number[] = [];
  for (const part of segmenter.segment(text)) {
    bounds.push(part.index);
  }
  bounds.push(text.length);
  return bounds;
};

/** Reply tokens are not reusable on a LINE redelivery, so none is kept then. */
export const replyTokenExpiry: (eventTimestamp: Date, isRedelivery: boolean) => Date | null = (
  eventTimestamp,
  isRedelivery,
) => (isRedelivery ? null : new Date(eventTimestamp.getTime() + REPLY_TOKEN_USABLE_MS));

/**
 * End of LINE's retry key window of an outbound message: LINE_RETRY_KEY_WINDOW_MS after its first
 * push. null while no push was attempted, since LINE has not seen the key yet.
 */
export const retryKeyExpiresAt: (m: Pick<Message, 'firstPushAt'>) => Date | null = (m) =>
  m.firstPushAt === null ? null : new Date(m.firstPushAt.getTime() + LINE_RETRY_KEY_WINDOW_MS);

/**
 * True once the window has passed (its end included): a push with the same key could then reach
 * the customer a second time, so "send again" is refused.
 */
export const isRetryKeyExpired: (m: Pick<Message, 'firstPushAt'>, now: Date) => boolean = (
  m,
  now,
) => {
  const expiresAt = retryKeyExpiresAt(m);
  return expiresAt !== null && now.getTime() >= expiresAt.getTime();
};

export const lineSecretStatus: (
  s: Pick<Settings, 'lineChannelId' | 'lineSecretVerifiedAt'>,
) => LineSecretStatus = (s) => {
  if (s.lineChannelId === null) return 'no_channel_id';
  return s.lineSecretVerifiedAt === null ? 'unchecked' : 'verified';
};

export const chooseSendChannel: (
  c: Pick<Contact, 'replyToken' | 'replyTokenExpiresAt'>,
  now: Date,
) => { channel: 'reply'; replyToken: string } | { channel: 'push' } = (c, now) => {
  if (c.replyToken && c.replyTokenExpiresAt && now.getTime() < c.replyTokenExpiresAt.getTime()) {
    return { channel: 'reply', replyToken: c.replyToken };
  }
  return { channel: 'push' };
};

export const splitLineText: (text: string, limit?: number) => string[] = (
  text,
  limit = LINE_TEXT_MAX_CHARS,
) => {
  if (text.length === 0) return [];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let bounds: number[] | null = null;
  let pos = 0;
  while (text.length - pos > limit) {
    // Prefer the last newline or space inside the window (the separator itself may sit at the end).
    const window = text.slice(pos, pos + limit + 1);
    const sep = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    if (sep > 0) {
      chunks.push(window.slice(0, sep));
      pos += sep + 1;
      continue;
    }
    if (sep === 0) {
      // Separator at the very start of the window: nothing to emit, skip it.
      pos += 1;
      continue;
    }
    // No separator: cut at the last grapheme boundary within the limit.
    bounds ??= graphemeBoundaries(text);
    let cut = -1;
    for (const b of bounds) {
      if (b <= pos) continue;
      if (b > pos + limit) break;
      cut = b;
    }
    if (cut === -1) {
      // A single grapheme longer than the limit: fall back to a code point boundary.
      const first = String.fromCodePoint(text.codePointAt(pos) ?? 0);
      cut = pos + Math.max(first.length, 1);
      if (cut - pos > limit) cut = pos + limit;
    }
    chunks.push(text.slice(pos, cut));
    pos = cut;
  }
  if (pos < text.length) chunks.push(text.slice(pos));
  return chunks;
};

export const toOutboundParts: (
  m: Pick<Message, 'type' | 'text' | 'mediaUrl' | 'previewUrl'>,
) => OutboundLinePart[] = (m) => {
  let parts: OutboundLinePart[];
  switch (m.type) {
    case 'text': {
      if (m.text === null) throw new Error('text message without text');
      parts = splitLineText(m.text).map((text) => ({ type: 'text', text }));
      break;
    }
    case 'image':
    case 'video': {
      if (m.mediaUrl === null || m.previewUrl === null) {
        throw new Error(`${m.type} message without mediaUrl or previewUrl`);
      }
      parts = [{ type: m.type, originalUrl: m.mediaUrl, previewUrl: m.previewUrl }];
      break;
    }
    case 'sticker':
    case 'other':
    case 'event':
      throw new Error(`message type ${m.type} cannot be sent to LINE`);
  }
  if (parts.length > LINE_MAX_PARTS_PER_REQUEST) {
    throw new Error('message needs more parts than one LINE request allows');
  }
  return parts;
};

export const previewOf: (m: Pick<Message, 'type' | 'text'>) => {
  type: Exclude<MessageType, 'event'>;
  text: string | null;
} = (m) => {
  if (m.type === 'event') throw new Error('event messages have no preview');
  if (m.type !== 'text' || m.text === null) return { type: m.type, text: null };
  const flat = m.text.replace(/\r\n|\r|\n/g, ' ');
  const bounds = graphemeBoundaries(flat);
  // bounds holds one entry per grapheme plus the end offset.
  const count = bounds.length - 1;
  const text =
    count <= PREVIEW_TEXT_MAX_CHARS ? flat : flat.slice(0, bounds[PREVIEW_TEXT_MAX_CHARS]);
  return { type: 'text', text };
};
