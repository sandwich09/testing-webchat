import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { POLL_OVERLAP_SEQ } from '@/contracts';
import { AVATAR_COLORS, POLL_BACKOFF_MAX_MS } from './common.constants';

/**
 * tailwind-merge only knows Tailwind's default type scale. Without this, the project's own sizes
 * (`--text-*` in app/globals.css, ui-screens 1.2) look like text colours, so `text-meta text-muted`
 * would drop the size and keep only the colour.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['body', 'name', 'sub', 'meta', 'title', 'section'] } },
});

/** Joins class names and lets later Tailwind utilities override earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Pure screen helpers (docs/specs/ui-screens.md section 8.1). None of them reads the clock.
// ---------------------------------------------------------------------------

const BANGKOK = 'Asia/Bangkok';
const LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);

/** First letter of a name for the fallback avatar. "?" when there is none. */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return '?';
  const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(trimmed)) {
    // Take the base letter of the grapheme: "อ็" gives "อ".
    const first = String.fromCodePoint(segment.codePointAt(0) ?? 0);
    if (LEADING_VOWELS.has(first) || !/^\p{L}$/u.test(first)) continue;
    return first.toLocaleUpperCase('en-US');
  }
  return '?';
}

/** Picks the avatar colour of an id with a 32-bit FNV-1a hash. */
export function avatarColor(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export type BangkokParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BANGKOK,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Calendar fields of an instant in Thai time (Gregorian year, month 1 to 12). */
export function bangkokParts(date: Date): BangkokParts {
  const out: BangkokParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0 };
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type in out) out[part.type as keyof BangkokParts] = Number(part.value);
  }
  return out;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of an instant in Thai time. */
export function bangkokDateKey(date: Date): string {
  const p = bangkokParts(date);
  return `${String(p.year)}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Whole days from one `YYYY-MM-DD` key to another (`to - from`). */
export function dayDiff(fromKey: string, toKey: string): number {
  const ms = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(toKey) - ms(fromKey)) / 86_400_000);
}

const monthFormatter = new Intl.DateTimeFormat('th-TH', { timeZone: BANGKOK, month: 'short' });

/** Thai short month name ("พ.ย.") of a month number 1 to 12. */
export function thaiShortMonth(month: number): string {
  return monthFormatter.format(new Date(Date.UTC(2000, month - 1, 15, 5)));
}

/** "18 พ.ย." or, with `withYear`, "18 พ.ย. 2569" (Buddhist era from a Gregorian year). */
export function formatShortDate(
  year: number,
  month: number,
  day: number,
  withYear: boolean,
): string {
  const base = `${String(day)} ${thaiShortMonth(month)}`;
  return withYear ? `${base} ${String(year + 543)}` : base;
}

/** "พ.ย. 2569" of a Gregorian year and month: the form of a month on screen. */
export function formatMonthYear(year: number, month: number): string {
  return `${thaiShortMonth(month)} ${String(year + 543)}`;
}

/** "2026-11" as "พ.ย. 2569"; a value of another shape is shown as it came. */
export function formatMonthKey(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  return formatMonthYear(Number(match[1]), Number(match[2]));
}

/**
 * "2026-11-03" as "3 พ.ย. 2569", always with the Buddhist-era year: a calendar date that is not
 * measured from today (such as the date of the price table). Another shape is shown as it came.
 */
export function formatDateKey(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  return formatShortDate(Number(match[1]), Number(match[2]), Number(match[3]), true);
}

/** "14:32" in Thai time, 24 hours. */
export function formatMessageTime(iso: string): string {
  const p = bangkokParts(new Date(iso));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "18 พ.ย. 14:32". A different year adds the Buddhist-era year: "18 พ.ย. 2568 14:32". */
export function formatDateTime(iso: string, now: Date): string {
  const p = bangkokParts(new Date(iso));
  const date = formatShortDate(p.year, p.month, p.day, p.year !== bangkokParts(now).year);
  return `${date} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

const intFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "12,345" */
export function formatInt(value: number): string {
  return intFormatter.format(value);
}

/**
 * Dollars for the screen from a decimal string: "1234.5" gives "$1,234.50". An amount above zero
 * that rounds to 0.00 gives "<$0.01". Works on the digits, never through a float.
 */
export function formatUsdForScreen(usd: string): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(usd.trim());
  if (!match) return usd;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(3, '0');
  let cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2));
  if ((fraction[2] ?? '0') >= '5') cents += 1n;
  if (cents === 0n) return /[1-9]/.test(`${whole}${match[2] ?? ''}`) ? '<$0.01' : '$0.00';
  return `$${intFormatter.format(cents / 100n)}.${pad2(Number(cents % 100n))}`;
}

/** Delay before the next poll: the base interval, doubled per failure up to the maximum. */
export function nextPollDelay(failures: number, baseMs: number): number {
  if (failures <= 0) return baseMs;
  return Math.min(baseMs * 2 ** (failures - 1), POLL_BACKOFF_MAX_MS);
}

/** `afterUpdatedSeq` of the next poll: the cursor minus the overlap, never below 0. */
export function pollAfter(cursor: string): string {
  const after = BigInt(cursor) - BigInt(POLL_OVERLAP_SEQ);
  return (after < 0n ? 0n : after).toString();
}

/** The greater of two sequence strings. */
export function advanceCursor(cursor: string, highWater: string): string {
  return BigInt(highWater) > BigInt(cursor) ? highWater : cursor;
}

function seqRank(seq: string | null): bigint {
  return seq === null ? -1n : BigInt(seq);
}

/**
 * Merges rows by id and keeps the one with the higher `updatedSeq` (null is the lowest: a row
 * that has not reached the server). Rows of `current` keep their place, new rows go last.
 */
export function mergeById<T extends { id: string; updatedSeq: string | null }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const merged = [...current];
  const index = new Map<string, number>();
  merged.forEach((row, i) => index.set(row.id, i));
  for (const row of incoming) {
    const at = index.get(row.id);
    if (at === undefined) {
      index.set(row.id, merged.length);
      merged.push(row);
    } else if (seqRank(row.updatedSeq) > seqRank((merged[at] as T).updatedSeq)) {
      merged[at] = row;
    }
  }
  return merged;
}
