// Pure logic of the thread components (ui-screens 5.3, 5.4, 6.2). No clock, no browser.
import { ERROR_MESSAGE_CODES, errorMessage, type ErrorMessageCode } from '@/common/error-messages';

import { copy, LOAD_OLDER_THRESHOLD_PX } from './inbox.constants';
import type { ThreadMessage } from './inbox.logic';

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
    }
  | { kind: 'sticker'; src: string | null }
  | { kind: 'other'; label: string };

/** Decides what `MediaContent` shows for a message of type image, video, sticker or other. */
export function resolveMedia(message: ThreadMessage): MediaView | null {
  switch (message.type) {
    case 'image':
    case 'video':
      return resolvePicture(message, message.type);
    case 'sticker':
      return { kind: 'sticker', src: message.sticker?.imageUrl ?? null };
    case 'other':
      return { kind: 'other', label: otherLabel(message.otherKind) };
    case 'text':
    case 'event':
      return null;
  }
}

function resolvePicture(message: ThreadMessage, kind: 'image' | 'video'): MediaView {
  const media = message.media;
  const failed: MediaView = { kind, state: 'failed', src: null, openable: false };
  if (media === null) return failed;
  switch (media.status) {
    case 'ready': {
      const src = media.previewUrl ?? media.url;
      return src === null ? failed : { kind, state: 'picture', src, openable: media.url !== null };
    }
    case 'pending': {
      // The local preview of a file the admin is sending shows until the server has a real one.
      const src = media.previewUrl ?? message.localPreviewUrl ?? null;
      return src === null
        ? { kind, state: 'pending', src: null, openable: false }
        : { kind, state: 'picture', src, openable: false };
    }
    case 'failed':
      return failed;
    case 'too_large':
      return { kind, state: 'too_large', src: null, openable: false };
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
// Delivery (ui-screens 5.3 row "สถานะส่งไม่สำเร็จ")
// ---------------------------------------------------------------------------

const isKnownCode = (code: string): code is ErrorMessageCode =>
  (ERROR_MESSAGE_CODES as readonly string[]).includes(code);

/**
 * Reason of a failed send from the error catalog (outbound wording). Catalog texts about sending
 * already start with "ส่งไม่สำเร็จ"; that word is dropped here because the line adds it. `null`
 * when the catalog has no text for the code.
 */
export function deliveryReason(code: string | null): string | null {
  if (code === null || !isKnownCode(code)) return null;
  const text = errorMessage(code, { variant: 'outbound' });
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
