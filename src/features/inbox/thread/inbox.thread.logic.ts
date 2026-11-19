// Pure logic of the thread components (ui-screens 5.3, 5.4, 6.2). No clock, no browser.
import { ERROR_MESSAGE_CODES, errorMessage, type ErrorMessageCode } from '@/common/error-messages';

import {
  AUDIO_MAX_BYTES,
  IMAGE_MAX_BYTES,
  LINE_RETRY_KEY_WINDOW_MS,
  VIDEO_MAX_BYTES,
  type MediaFailure,
} from '@/contracts';
import { copy, LOAD_OLDER_THRESHOLD_PX } from '../inbox.constants';
import type { ThreadMessage } from '../inbox.logic';

// ---------------------------------------------------------------------------
// Scrolling (ui-screens 5.4)
// ---------------------------------------------------------------------------

/**
 * Rows that arrived at the bottom since the last render. `seen` holds the ids already shown.
 * Rows above the first seen row are older pages and do not count; rows below it that are not
 * seen are new (a message sent a moment ago can sit between them, so the last id is not enough).
 * On the first render `seen` is empty and nothing counts as new.
 */
export function newMessages(
  items: readonly ThreadMessage[],
  seen: ReadonlySet<string>,
): ThreadMessage[] {
  const first = items.findIndex((m) => seen.has(m.id));
  if (first === -1) return [];
  return items.slice(first + 1).filter((m) => !seen.has(m.id));
}

export type TailPlan = {
  /** Scroll to the bottom now. */
  scroll: boolean;
  /** Show the "new messages" button instead. */
  showButton: boolean;
  /** Ask the server to clear the unread count. */
  markRead: boolean;
  /** The tail has an inbound message (so unread may need clearing once the reader reaches it). */
  inbound: boolean;
};

/**
 * What to do when `tail` arrived at the bottom. `stuck` is whether the reader was at the bottom
 * before the merge. A message the admin just sent (`localState: "sending"`) always scrolls.
 * Unread is cleared only for an inbound message that is in view while the tab is visible.
 */
export function planTailScroll(
  tail: readonly ThreadMessage[],
  stuck: boolean,
  tabVisible: boolean,
): TailPlan {
  if (tail.length === 0) {
    return { scroll: false, showButton: false, markRead: false, inbound: false };
  }
  const sentByAdmin = tail.some((m) => m.localState === 'sending');
  const scroll = sentByAdmin || stuck;
  const inbound = tail.some((m) => m.direction === 'inbound' && m.type !== 'event');
  return { scroll, showButton: !scroll, markRead: scroll && inbound && tabVisible, inbound };
}

/** Whether to ask for older messages: near the top, more exist and no request is running. */
export function shouldLoadOlder(m: {
  scrollTop: number;
  hasOlder: boolean;
  fetching: boolean;
  thresholdPx?: number;
}): boolean {
  return m.hasOlder && !m.fetching && m.scrollTop <= (m.thresholdPx ?? LOAD_OLDER_THRESHOLD_PX);
}

/**
 * `scrollTop` that keeps the reader on the same line after content was added above. `anchor` is
 * the position taken before the request, `scrollHeight` the height now.
 */
export function restoredScrollTop(
  anchor: { scrollTop: number; scrollHeight: number },
  scrollHeight: number,
): number {
  return anchor.scrollTop + (scrollHeight - anchor.scrollHeight);
}

// ---------------------------------------------------------------------------
// Media (ui-screens 5.3 table "MediaContent")
// ---------------------------------------------------------------------------

export type MediaView =
  | {
      kind: 'image' | 'video';
      /** `picture`: show `src`; `pending`: skeleton box; `failed` and `too_large`: text box. */
      state: 'picture' | 'pending' | 'failed' | 'too_large';
      src: string | null;
      /** The picture can open the lightbox (the file is ready and has a URL). */
      openable: boolean;
      /** Why `failed` media cannot be shown, when the server recorded it. */
      failure: MediaFailure | null;
    }
  | {
      kind: 'audio';
      /** `ready`: the player over `src`; `pending`, `failed` and `too_large` as for pictures. */
      state: 'ready' | 'pending' | 'failed' | 'too_large';
      src: string | null;
      /** From the LINE event; the player shows the file's own length once it has loaded. */
      durationMs: number | null;
      failure: MediaFailure | null;
    }
  | { kind: 'sticker'; src: string | null }
  | { kind: 'other'; label: string };

const MB = 1024 * 1024;
const INBOUND_MAX_BYTES: Record<'image' | 'video' | 'audio', number> = {
  image: IMAGE_MAX_BYTES,
  video: VIDEO_MAX_BYTES,
  audio: AUDIO_MAX_BYTES,
};

/**
 * Why media cannot be shown, for the text box of `failed` and `too_large` (ui-copy
 * `inbox.media.problem.*`). `failure` is the reason the server recorded; null for a row stored
 * before reasons were kept, which gets the plain text of its kind.
 */
export function mediaProblemText(
  kind: 'image' | 'video' | 'audio',
  state: 'failed' | 'too_large',
  failure: MediaFailure | null,
): string {
  if (state === 'too_large') {
    return fillCopy(copy.media.problem.too_large, {
      maxMb: String(Math.round((INBOUND_MAX_BYTES[kind] / MB) * 10) / 10),
    });
  }
  if (failure !== null) return copy.media.problem[failure];
  return kind === 'image'
    ? copy.media.imageFailed
    : kind === 'video'
      ? copy.media.videoFailed
      : copy.media.audioFailed;
}

/** Decides what `MediaContent` shows for a message of type image, video, sticker or other. */
export function resolveMedia(message: ThreadMessage): MediaView | null {
  switch (message.type) {
    case 'image':
    case 'video':
      return resolvePicture(message, message.type);
    case 'audio':
      return resolveAudio(message);
    case 'sticker':
      return { kind: 'sticker', src: message.sticker?.imageUrl ?? null };
    case 'other':
      return { kind: 'other', label: otherLabel(message.otherKind) };
    case 'text':
    case 'event':
      return null;
  }
}

function resolveAudio(message: ThreadMessage): MediaView {
  const media = message.media;
  const durationMs = media?.durationMs ?? null;
  const failure = media?.failure ?? null;
  if (media === null) return { kind: 'audio', state: 'failed', src: null, durationMs, failure };
  if (media.status === 'ready') {
    return media.url === null
      ? { kind: 'audio', state: 'failed', src: null, durationMs, failure }
      : { kind: 'audio', state: 'ready', src: media.url, durationMs, failure: null };
  }
  return {
    kind: 'audio',
    state: media.status,
    src: null,
    durationMs,
    failure: media.status === 'failed' ? failure : null,
  };
}

/** "0:07" or "12:05": minutes and two-digit seconds of a length in seconds (rounded down). */
export function formatAudioTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** Played share of the audio, 0 to 1, for the progress bar. */
export function audioProgress(currentSeconds: number, totalSeconds: number | null): number {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, currentSeconds / totalSeconds));
}

function resolvePicture(message: ThreadMessage, kind: 'image' | 'video'): MediaView {
  const media = message.media;
  const failure = media?.failure ?? null;
  const failed: MediaView = { kind, state: 'failed', src: null, openable: false, failure };
  if (media === null) return failed;
  switch (media.status) {
    case 'ready': {
      const src = media.previewUrl ?? media.url;
      return src === null
        ? failed
        : { kind, state: 'picture', src, openable: media.url !== null, failure: null };
    }
    case 'pending': {
      // The local preview of a file the admin is sending shows until the server has a real one.
      const src = media.previewUrl ?? message.localPreviewUrl ?? null;
      return src === null
        ? { kind, state: 'pending', src: null, openable: false, failure: null }
        : { kind, state: 'picture', src, openable: false, failure: null };
    }
    case 'failed':
      return failed;
    case 'too_large':
      return { kind, state: 'too_large', src: null, openable: false, failure: null };
  }
}

const OTHER_LABELS: Record<string, string> = {
  audio: copy.media.other.audio,
  file: copy.media.other.file,
  location: copy.media.other.location,
};

/** Label of a message of type `other` (`inbox.media.other.*`). */
export function otherLabel(kind: string | null): string {
  return (
    (kind !== null && Object.hasOwn(OTHER_LABELS, kind) ? OTHER_LABELS[kind] : undefined) ??
    copy.media.other.unknown
  );
}

// ---------------------------------------------------------------------------
// Quote (ui-screens 5.3 row "ข้อความที่ตอบกลับ")
// ---------------------------------------------------------------------------

export type QuoteView =
  | { available: false; text: string; ariaLabel: string }
  | {
      available: true;
      /** Message to scroll to; null when it cannot be found in the thread. */
      messageId: string | null;
      author: string;
      text: string;
      ariaLabel: string;
    };

/** One line of a quoted message: its text, or the label of its kind. */
function quotedText(q: NonNullable<ThreadMessage['quote']>): string {
  if (q.textPreview !== null && q.textPreview !== '') return q.textPreview;
  const kind = q.mediaKind;
  if (kind === null) return '';
  if (kind === 'image') return copy.media.image;
  if (kind === 'video') return copy.media.video;
  if (kind === 'sticker') return copy.media.sticker;
  return otherLabel(kind);
}

/** What the quoted block of a bubble shows; null for a message that quotes nothing. */
export function quoteView(quote: ThreadMessage['quote'], customerName: string): QuoteView | null {
  if (quote === null) return null;
  if (!quote.available) {
    return {
      available: false,
      text: copy.quote.unavailable,
      ariaLabel: copy.quote.labelUnavailable,
    };
  }
  const author =
    quote.author === 'ai'
      ? copy.message.senderAi
      : quote.author === 'admin'
        ? copy.message.senderYou
        : customerName;
  const text = quotedText(quote);
  return {
    available: true,
    messageId: quote.messageId,
    author,
    text,
    ariaLabel: fillCopy(copy.quote.label, { name: author, text }),
  };
}

// ---------------------------------------------------------------------------
// Delivery (ui-screens 5.3 row "สถานะส่งไม่สำเร็จ")
// ---------------------------------------------------------------------------

const isKnownCode = (code: string): code is ErrorMessageCode =>
  (ERROR_MESSAGE_CODES as readonly string[]).includes(code);

/** `{hours}` of the `message.retry_expired` text. */
const RETRY_KEY_WINDOW_HOURS = LINE_RETRY_KEY_WINDOW_MS / 3_600_000;

/**
 * Reason of a failed send from the error catalog (outbound wording). Catalog texts about sending
 * already start with "ส่งไม่สำเร็จ"; that word is dropped here because the line adds it. `null`
 * when the catalog has no text for the code.
 */
export function deliveryReason(code: string | null): string | null {
  if (code === null || !isKnownCode(code)) return null;
  const text = errorMessage(code, {
    variant: 'outbound',
    hours: RETRY_KEY_WINDOW_HOURS,
    imageMaxMb: Math.round((IMAGE_MAX_BYTES / MB) * 10) / 10,
    videoMaxMb: Math.round((VIDEO_MAX_BYTES / MB) * 10) / 10,
  });
  if (text === null) return null;
  const stripped = text.startsWith(copy.message.failed)
    ? text.slice(copy.message.failed.length).trim()
    : text;
  return stripped === '' ? null : stripped;
}

/** The failed line under a bubble: "ส่งไม่สำเร็จ · เหตุผล", or just "ส่งไม่สำเร็จ" without a reason. */
export function failedLineText(code: string | null): string {
  const reason = deliveryReason(code);
  return reason === null ? copy.message.failed : `${copy.message.failed} · ${reason}`;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Fills `{name}` placeholders of a copy text. */
export function fillCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}
