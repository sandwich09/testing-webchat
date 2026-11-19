import { describe, expect, it } from 'vitest';
import {
  advanceCursor,
  avatarColor,
  bangkokDateKey,
  cn,
  dayDiff,
  formatDateKey,
  formatDateTime,
  formatInt,
  formatMessageTime,
  formatMonthKey,
  nextTabIndex,
  formatMonthYear,
  formatUsdForScreen,
  initialOf,
  mergeById,
  nextPollDelay,
  pollAfter,
} from './common.logic';
import { AVATAR_COLORS, POLL_BACKOFF_MAX_MS } from './common.constants';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, undefined, null, 'b', { c: true, d: false })).toBe('a b c');
  });

  it('lets a later Tailwind utility override a conflicting earlier one', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('keeps a project font size next to a text colour (ui-screens 1.2)', () => {
    expect(cn('text-meta text-muted')).toBe('text-meta text-muted');
    expect(cn('text-sub', 'text-danger', 'text-fg')).toBe('text-sub text-fg');
  });

  it('lets a later project font size override an earlier one', () => {
    expect(cn('text-meta', 'text-sub')).toBe('text-sub');
  });
});

describe('initialOf', () => {
  it('returns "?" for empty or blank names', () => {
    expect(initialOf('')).toBe('?');
    expect(initialOf('   ')).toBe('?');
  });

  it('skips leading vowels and non-letters', () => {
    expect(initialOf('เอ็มมี่')).toBe('อ');
    expect(initialOf('โสภา')).toBe('ส');
    expect(initialOf('🍰 Cake')).toBe('C');
  });

  it('upper-cases Latin letters', () => {
    expect(initialOf('somchai')).toBe('S');
  });

  it('returns "?" when no letter exists', () => {
    expect(initialOf('🍰 123')).toBe('?');
  });
});

describe('avatarColor', () => {
  it('is stable and picks from the palette', () => {
    expect(avatarColor('abc')).toBe(avatarColor('abc'));
    expect(AVATAR_COLORS).toContain(avatarColor('U1234'));
  });

  it('uses FNV-1a (hash of the empty string is the offset basis)', () => {
    expect(avatarColor('')).toBe(AVATAR_COLORS[0x811c9dc5 % AVATAR_COLORS.length]);
  });
});

describe('time formats (TZ-independent)', () => {
  it('formats the message time in Thai time', () => {
    expect(formatMessageTime('2026-11-18T07:32:10.000Z')).toBe('14:32');
    expect(formatMessageTime('2026-11-17T17:05:00.000Z')).toBe('00:05');
  });

  it('formats the date and time without a year in the same year', () => {
    const now = new Date('2026-11-20T05:00:00.000Z');
    expect(formatDateTime('2026-11-18T07:32:00.000Z', now)).toBe('18 พ.ย. 14:32');
  });

  it('adds the Buddhist-era year across years', () => {
    const now = new Date('2026-11-20T05:00:00.000Z');
    expect(formatDateTime('2025-11-18T07:32:00.000Z', now)).toBe('18 พ.ย. 2568 14:32');
  });

  it('decides the year in Thai time', () => {
    const now = new Date('2026-12-31T17:30:00.000Z'); // 2027-01-01 in Thai time
    expect(formatDateTime('2026-12-31T05:00:00.000Z', now)).toBe('31 ธ.ค. 2569 12:00');
  });

  it('writes a month as the short month and the Buddhist-era year', () => {
    expect(formatMonthYear(2026, 11)).toBe('พ.ย. 2569');
    expect(formatMonthKey('2026-12')).toBe('ธ.ค. 2569');
    expect(formatMonthKey('2027-01')).toBe('ม.ค. 2570');
    expect(formatMonthKey('not a month')).toBe('not a month');
  });

  it('writes a calendar date key with its Buddhist-era year, never as ISO', () => {
    expect(formatDateKey('2026-11-03')).toBe('3 พ.ย. 2569');
    expect(formatDateKey('2026-12-31')).toBe('31 ธ.ค. 2569');
    expect(formatDateKey('2027-01-01')).toBe('1 ม.ค. 2570');
    expect(formatDateKey('2026-11')).toBe('2026-11');
  });

  it('builds date keys and day differences', () => {
    expect(bangkokDateKey(new Date('2026-11-17T17:00:00.000Z'))).toBe('2026-11-18');
    expect(dayDiff('2026-11-18', '2026-11-19')).toBe(1);
    expect(dayDiff('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('formatInt', () => {
  it('uses commas', () => {
    expect(formatInt(12345)).toBe('12,345');
    expect(formatInt(0)).toBe('0');
  });
});

describe('formatUsdForScreen', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatUsdForScreen('1234.560000')).toBe('$1,234.56');
    expect(formatUsdForScreen('5.00')).toBe('$5.00');
    expect(formatUsdForScreen('0.126000')).toBe('$0.13');
  });

  it('shows zero as $0.00', () => {
    expect(formatUsdForScreen('0.000000')).toBe('$0.00');
  });

  it('shows a tiny positive amount as <$0.01', () => {
    expect(formatUsdForScreen('0.001234')).toBe('<$0.01');
    expect(formatUsdForScreen('0.004999')).toBe('<$0.01');
    expect(formatUsdForScreen('0.005000')).toBe('$0.01');
  });

  it('carries the rounding into the dollars', () => {
    expect(formatUsdForScreen('0.999500')).toBe('$1.00');
  });
});

describe('nextPollDelay', () => {
  it('returns the base without failures', () => {
    expect(nextPollDelay(0, 4000)).toBe(4000);
  });

  it('doubles per failure and caps', () => {
    expect(nextPollDelay(1, 4000)).toBe(4000);
    expect(nextPollDelay(2, 4000)).toBe(8000);
    expect(nextPollDelay(3, 4000)).toBe(16000);
    expect(nextPollDelay(4, 4000)).toBe(POLL_BACKOFF_MAX_MS);
    expect(nextPollDelay(50, 4000)).toBe(POLL_BACKOFF_MAX_MS);
  });
});

describe('pollAfter and advanceCursor', () => {
  it('never goes below zero', () => {
    expect(pollAfter('15')).toBe('0');
    expect(pollAfter('0')).toBe('0');
    expect(pollAfter('20')).toBe('0');
    expect(pollAfter('21')).toBe('1');
  });

  it('uses bigint for large values', () => {
    expect(pollAfter('9223372036854775807')).toBe('9223372036854775787');
    expect(advanceCursor('9007199254740993', '9007199254740992')).toBe('9007199254740993');
    expect(advanceCursor('9007199254740992', '9007199254740993')).toBe('9007199254740993');
  });

  it('keeps the greater cursor', () => {
    expect(advanceCursor('5', '9')).toBe('9');
    expect(advanceCursor('9', '5')).toBe('9');
    expect(advanceCursor('100', '99')).toBe('100');
  });
});

describe('mergeById', () => {
  type Row = { id: string; updatedSeq: string | null; v: string };

  it('keeps the row with the higher updatedSeq', () => {
    const merged = mergeById<Row>(
      [{ id: 'a', updatedSeq: '5', v: 'old' }],
      [{ id: 'a', updatedSeq: '9', v: 'new' }],
    );
    expect(merged).toEqual([{ id: 'a', updatedSeq: '9', v: 'new' }]);
    const stale = mergeById<Row>(
      [{ id: 'a', updatedSeq: '9', v: 'new' }],
      [{ id: 'a', updatedSeq: '5', v: 'old' }],
    );
    expect(stale[0]?.v).toBe('new');
  });

  it('compares sequences as numbers, not strings', () => {
    const merged = mergeById<Row>(
      [{ id: 'a', updatedSeq: '9', v: 'old' }],
      [{ id: 'a', updatedSeq: '10', v: 'new' }],
    );
    expect(merged[0]?.v).toBe('new');
  });

  it('lets a server row beat a local row with a null updatedSeq', () => {
    const merged = mergeById<Row>(
      [{ id: 'a', updatedSeq: null, v: 'local' }],
      [{ id: 'a', updatedSeq: '1', v: 'server' }],
    );
    expect(merged[0]?.v).toBe('server');
    const kept = mergeById<Row>(
      [{ id: 'a', updatedSeq: '1', v: 'server' }],
      [{ id: 'a', updatedSeq: null, v: 'local' }],
    );
    expect(kept[0]?.v).toBe('server');
  });

  it('keeps the current row on a tie and appends new rows', () => {
    const merged = mergeById<Row>(
      [
        { id: 'a', updatedSeq: '1', v: 'cur' },
        { id: 'b', updatedSeq: '2', v: 'cur' },
      ],
      [
        { id: 'c', updatedSeq: '3', v: 'new' },
        { id: 'a', updatedSeq: '1', v: 'dup' },
      ],
    );
    expect(merged.map((r) => `${r.id}:${r.v}`)).toEqual(['a:cur', 'b:cur', 'c:new']);
  });
});

describe('nextTabIndex', () => {
  it('wraps around', () => {
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
    expect(nextTabIndex('ArrowDown', 0, 3)).toBeNull();
  });
});
