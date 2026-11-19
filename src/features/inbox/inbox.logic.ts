// Pure logic of the inbox screens (docs/specs/ui-screens.md section 8.2). Nothing here reads the
// clock or touches the browser: "now" always comes in as an argument.
import { copy as commonCopy } from '@/common/common.constants';
import {
  bangkokDateKey,
  bangkokParts,
  dayDiff,
  formatMessageTime,
  formatShortDate,
  mergeById,
} from '@/common/common.logic';
import { eventCodeText } from '@/common/error-messages';
import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  type ContactDetailDto,
  type ContactDto,
  type ContactFilter,
  type MessageDto,
} from '@/contracts';
import { copy, GROUP_GAP_MS, STICK_TO_BOTTOM_PX } from './inbox.constants';

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

// Thai abbreviated weekdays as written in chat lists. Intl's `short` gives the full word.
const THAI_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const;

function thaiWeekday(at: Date): string {
  const p = bangkokParts(at);
  // Day of week of a calendar date, computed on the Bangkok date so it does not depend on the machine zone.
  const index = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return THAI_WEEKDAYS[index] ?? '';
}

/** Time for the contact list: time today, "yesterday", weekday within a week, then the date. */
export function formatListTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const diff = dayDiff(bangkokDateKey(at), bangkokDateKey(now));
  if (diff <= 0) return formatMessageTime(iso);
  if (diff === 1) return commonCopy.time.yesterday;
  if (diff <= 6) return thaiWeekday(at);
  const p = bangkokParts(at);
  return formatShortDate(p.year, p.month, p.day, p.year !== bangkokParts(now).year);
}

/** Label of the day chip in the thread. `dateKey` is `YYYY-MM-DD` in Thai time. */
export function formatDayChip(dateKey: string, now: Date): string {
  const diff = dayDiff(dateKey, bangkokDateKey(now));
  if (diff === 0) return commonCopy.time.today;
  if (diff === 1) return commonCopy.time.yesterday;
  const [y, m, d] = dateKey.split('-').map(Number);
  return formatShortDate(y ?? 0, m ?? 1, d ?? 1, (y ?? 0) !== bangkokParts(now).year);
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

export type ThreadMessage = Omit<MessageDto, 'seq' | 'updatedSeq'> & {
  /** null while the row has not reached the server. */
  seq: string | null;
  updatedSeq: string | null;
  localState?: 'sending' | 'unconfirmed' | 'failed';
  localError?: string;
  localPreviewUrl?: string;
};

/** Order of the thread: by `seq`, rows without one last in `createdAt` order. */
export function sortMessages(items: readonly ThreadMessage[]): ThreadMessage[] {
  return [...items].sort((a, b) => {
    if (a.seq !== null && b.seq !== null) {
      const x = BigInt(a.seq);
      const y = BigInt(b.seq);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    if (a.seq !== null) return -1;
    if (b.seq !== null) return 1;
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function sameThread(a: readonly ThreadMessage[], b: readonly ThreadMessage[]): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) => {
      const other = b[i] as ThreadMessage;
      return (
        row.id === other.id &&
        row.updatedSeq === other.updatedSeq &&
        row.localState === other.localState
      );
    })
  );
}

/**
 * Merges polled or fetched rows into the thread. A server row replaces the local one with the
 * same id when its `updatedSeq` is higher and clears the local state. `current` itself comes
 * back when nothing changed, so React does not render again.
 */
export function mergeThread(
  current: readonly ThreadMessage[],
  incoming: readonly MessageDto[],
): ThreadMessage[] {
  const before = new Map(current.map((row) => [row.id, row]));
  const fromServer = new Map<string, unknown>(incoming.map((row) => [row.id, row]));
  const merged = mergeById<ThreadMessage>(current, incoming).map((row) => {
    const old = before.get(row.id);
    if (old === undefined || row !== fromServer.get(row.id)) return row;
    // The row came from the server: drop local state, keep the local preview until a real one exists.
    const server: ThreadMessage = { ...row };
    delete server.localState;
    delete server.localError;
    delete server.localPreviewUrl;
    const keepPreview =
      old.localPreviewUrl !== undefined && !(server.media?.previewUrl ?? null)
        ? { localPreviewUrl: old.localPreviewUrl }
        : {};
    return { ...server, ...keepPreview };
  });
  const sorted = sortMessages(merged);
  return sameThread(sorted, current) ? (current as ThreadMessage[]) : sorted;
}

/** Lowest `seq` in the thread, used as `beforeSeq` to load older messages. */
export function oldestSeq(items: readonly ThreadMessage[]): string | undefined {
  let lowest: string | undefined;
  for (const item of items) {
    if (item.seq !== null && (lowest === undefined || BigInt(item.seq) < BigInt(lowest))) {
      lowest = item.seq;
    }
  }
  return lowest;
}

export type DisplayItem =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'group';
      key: string;
      author: 'customer' | 'admin' | 'ai';
      messages: ThreadMessage[];
    }
  | { kind: 'event'; key: string; message: ThreadMessage }
  /** The welcome card sent on a follow (event code `welcome.sent`). */
  | { kind: 'welcome'; key: string; message: ThreadMessage };

/** Event codes of a customer's tap on a rich menu or welcome card button (error-catalog). */
const TAP_EVENT_CODES: ReadonlySet<string> = new Set([
  'customer.tapped_ai_on',
  'customer.tapped_admin',
  'customer.tapped_how_to',
]);

/**
 * Whether a message shows as an event line: an event row, or a tap, which is stored as the
 * customer's text (the button title) with the event code of the button.
 */
export function showsAsEventLine(message: Pick<ThreadMessage, 'type' | 'eventCode'>): boolean {
  return (
    message.type === 'event' ||
    (message.eventCode !== null && TAP_EVENT_CODES.has(message.eventCode))
  );
}

/** Whether a message is the welcome card sent on a follow. */
export function isWelcomeCard(message: Pick<ThreadMessage, 'eventCode' | 'direction'>): boolean {
  return message.direction === 'outbound' && message.eventCode === 'welcome.sent';
}

/** Turns a sorted thread into day chips, event lines and groups of messages by one sender. */
export function groupMessagesForDisplay(items: readonly ThreadMessage[], now: Date): DisplayItem[] {
  const out: DisplayItem[] = [];
  let dayKey: string | null = null;
  let open: Extract<DisplayItem, { kind: 'group' }> | null = null;
  let lastAt = 0;

  for (const message of items) {
    const isEvent = showsAsEventLine(message);
    if (isEvent && (message.eventCode === null || eventCodeText(message.eventCode) === null)) {
      continue; // an unknown event code is not shown
    }
    if (!isEvent && message.author === 'system') continue; // no sender label exists for it

    const at = Date.parse(message.createdAt);
    const key = bangkokDateKey(new Date(at));
    if (key !== dayKey) {
      dayKey = key;
      open = null;
      out.push({ kind: 'day', key: `day-${key}`, label: formatDayChip(key, now) });
    }

    if (isEvent) {
      open = null;
      out.push({ kind: 'event', key: message.id, message });
      continue;
    }
    if (isWelcomeCard(message)) {
      open = null;
      out.push({ kind: 'welcome', key: message.id, message });
      continue;
    }

    const author = message.author as 'customer' | 'admin' | 'ai';
    if (open !== null && open.author === author && at - lastAt <= GROUP_GAP_MS) {
      open.messages.push(message);
    } else {
      open = { kind: 'group', key: message.id, author, messages: [message] };
      out.push(open);
    }
    lastAt = at;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact list
// ---------------------------------------------------------------------------

/** Whether a contact belongs in the list for a filter and a search text. */
export function matchesContactFilter(c: ContactDto, filter: ContactFilter, q: string): boolean {
  if (filter === 'unread' && c.unreadCount <= 0) return false;
  if (filter === 'needs_admin' && !c.needsAdmin) return false;
  const needle = q.trim().toLowerCase();
  if (needle === '') return true;
  return (c.displayName ?? '').toLowerCase().includes(needle);
}

/**
 * Newest first by `lastMessage.at` (the customer's latest message, or creation), then by id, as
 * `GET /api/contacts` orders.
 */
export function compareContacts(a: ContactDto, b: ContactDto): number {
  const x = Date.parse(a.lastMessage?.at ?? a.createdAt);
  const y = Date.parse(b.lastMessage?.at ?? b.createdAt);
  if (x !== y) return y - x;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Whether the thread is near enough to the bottom to follow new messages. */
export function shouldStickToBottom(
  m: { scrollTop: number; scrollHeight: number; clientHeight: number },
  thresholdPx: number = STICK_TO_BOTTOM_PX,
): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= thresholdPx;
}

export type Preview = { prefix: string | null; prefixTone: 'muted' | 'warn'; text: string };

/** One-line preview of a contact in the list. */
export function buildContactPreview(c: ContactDto): Preview {
  if (c.followStatus === 'unfollowed') {
    return { prefix: null, prefixTone: 'muted', text: copy.contact.unfollowed };
  }
  const last = c.lastMessage;
  let text: string = copy.preview.none;
  if (last !== null) {
    switch (last.type) {
      case 'image':
        text = copy.media.image;
        break;
      case 'video':
        text = copy.media.video;
        break;
      case 'audio':
        text = copy.media.audio;
        break;
      case 'sticker':
        text = copy.media.sticker;
        break;
      case 'other':
        text = copy.media.other.unknown;
        break;
      case 'text':
      default:
        text = (last.text ?? '').replace(/\s*[\r\n]+\s*/g, ' ');
    }
  }
  if (c.needsAdmin) return { prefix: copy.preview.needsAdmin, prefixTone: 'warn', text };
  if (last?.by === 'admin') return { prefix: copy.preview.you, prefixTone: 'muted', text };
  if (last?.by === 'ai') return { prefix: copy.preview.ai, prefixTone: 'muted', text };
  return { prefix: null, prefixTone: 'muted', text };
}

export type AiSwitchView = { checked: boolean; disabled: boolean; label: string; note: string };

/** State of the AI switch of a contact. `killSwitchOn` is the global AI setting. */
export function aiSwitchView(c: ContactDetailDto, killSwitchOn: boolean): AiSwitchView {
  if (!killSwitchOn) {
    return {
      checked: false,
      disabled: true,
      label: copy.ai.labelKilled,
      note: copy.ai.noteKilled,
    };
  }
  if (c.followStatus === 'unfollowed') {
    return { checked: false, disabled: true, label: copy.ai.label, note: copy.ai.noteUnfollowed };
  }
  return c.aiEnabled
    ? { checked: true, disabled: false, label: copy.ai.label, note: copy.ai.noteOn }
    : { checked: false, disabled: false, label: copy.ai.label, note: copy.ai.noteOff };
}

/** Second line of the thread header. */
export function threadSubline(
  c: ContactDetailDto,
  killSwitchOn: boolean,
): { follow: string; ai: string | null; aiTone: 'muted' | 'warn' } {
  const follow = c.followStatus === 'unfollowed' ? copy.contact.unfollowed : copy.thread.following;
  if (c.needsAdmin) return { follow, ai: copy.thread.needsAdmin, aiTone: 'warn' };
  if (c.aiEnabled && killSwitchOn) return { follow, ai: copy.thread.aiHelping, aiTone: 'muted' };
  return { follow, ai: null, aiTone: 'muted' };
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export type ComposerBlock = 'unfollowed' | 'line_not_configured' | null;

/** Why the composer is closed. LINE not configured wins over unfollowed. */
export function composerDisabledReason(
  c: ContactDetailDto,
  lineConfigured: boolean,
): ComposerBlock {
  if (!lineConfigured) return 'line_not_configured';
  if (c.followStatus === 'unfollowed') return 'unfollowed';
  return null;
}

/**
 * State of the attachment tray (ui-screens 7.6). The spec names the type without defining it:
 * only the status matters here, `useAttachment` adds its own fields on top.
 */
export type AttachmentState = {
  status:
    | 'idle'
    | 'validating'
    | 'converting'
    | 'requesting'
    | 'uploading'
    | 'ready'
    | 'rejected'
    | 'failed'
    | 'cancelling';
};

/** Enter sends; Shift+Enter and Enter while composing Thai or other IME text do not. */
export function isSubmitKey(e: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
}): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}

/**
 * The send button is enabled with text or a ready attachment. An attachment that is still being
 * prepared or uploaded blocks sending. A rejected or failed one is not sent, so text alone can go.
 */
export function canSend(draft: string, attachment: AttachmentState, block: ComposerBlock): boolean {
  if (block !== null) return false;
  switch (attachment.status) {
    case 'ready':
      return true;
    case 'idle':
    case 'rejected':
    case 'failed':
      return draft.trim() !== '';
    case 'validating':
    case 'converting':
    case 'requesting':
    case 'uploading':
    case 'cancelling':
      return false;
  }
}

/** Whether a typing ping is due. */
export function shouldSendTypingPing(
  lastSentAt: number | null,
  nowMs: number,
  intervalMs: number,
): boolean {
  return lastSentAt === null || nowMs - lastSentAt >= intervalMs;
}

export type Segment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

// http(s) only. Thai letters end a link because Thai text has no spaces between words.
const URL_PATTERN = /https?:\/\/[^\s฀-๿]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/** Splits text into plain text and http(s) links. Trailing punctuation stays out of the link. */
export function linkify(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const pushText = (value: string): void => {
    if (value === '') return;
    const tail = out[out.length - 1];
    if (tail?.kind === 'text') tail.text += value;
    else out.push({ kind: 'text', text: value });
  };
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!/^https?:\/\/./.test(url)) continue;
    pushText(text.slice(last, start));
    out.push({ kind: 'link', text: url, href: url });
    last = start + url.length;
  }
  pushText(text.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type MediaKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'mp4' | 'mov' | 'unknown';

const startsWith = (head: Uint8Array, bytes: readonly number[], at = 0): boolean =>
  head.length >= at + bytes.length && bytes.every((b, i) => head[at + i] === b);

const ascii = (head: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...head.slice(from, to));

/** Detects the real type of a file from its first bytes. Names and MIME types are not trusted. */
export function sniffMediaType(head: Uint8Array): MediaKind {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return 'heic';
    if (brand === 'qt  ') return 'mov';
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) return 'mp4';
  }
  return 'unknown';
}

export type AttachmentCheck =
  | { ok: true; kind: 'image' | 'video'; needsConversion: boolean; sourceType: MediaKind }
  | {
      ok: false;
      code:
        | 'unsupported_type'
        | 'mov_not_supported'
        | 'image_too_large'
        | 'video_too_large'
        | 'empty_file';
      sizeMb?: string;
    };

/** Checks a picked file by its content and size. */
export function validateAttachment(
  file: { name: string; type: string; size: number },
  head: Uint8Array,
): AttachmentCheck {
  if (file.size === 0) return { ok: false, code: 'empty_file' };
  const sourceType = sniffMediaType(head);
  if (sourceType === 'mov') return { ok: false, code: 'mov_not_supported' };
  if (sourceType === 'unknown') return { ok: false, code: 'unsupported_type' };
  const kind = sourceType === 'mp4' ? 'video' : 'image';
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  if (kind === 'image' && file.size > IMAGE_MAX_BYTES) {
    return { ok: false, code: 'image_too_large', sizeMb };
  }
  if (kind === 'video' && file.size > VIDEO_MAX_BYTES) {
    return { ok: false, code: 'video_too_large', sizeMb };
  }
  return {
    ok: true,
    kind,
    needsConversion: sourceType === 'heic' || sourceType === 'webp',
    sourceType,
  };
}

/** Scales down so the longer side is at most `maxEdge`. Never enlarges, never below 1px. */
export function computeTargetSize(
  w: number,
  h: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(w, h);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
