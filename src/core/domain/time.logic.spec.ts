import { describe, expect, it } from 'vitest';
import {
  bangkokDayRange,
  bangkokMonthOf,
  bangkokMonthRange,
  requireBangkokMonthRange,
} from './time.logic';

const iso = (d: Date): string => d.toISOString();

describe('bangkokDayRange', () => {
  it('matches the documented example', () => {
    const r = bangkokDayRange(new Date('2026-11-18T05:00:00Z'));
    expect([iso(r.from), iso(r.to)]).toEqual([
      '2026-11-17T17:00:00.000Z',
      '2026-11-18T17:00:00.000Z',
    ]);
  });

  it('crosses Bangkok midnight, not UTC midnight', () => {
    // 16:59:59.999Z is 23:59:59.999 in Bangkok; 17:00Z is the next Bangkok day.
    const before = bangkokDayRange(new Date('2026-11-17T16:59:59.999Z'));
    const after = bangkokDayRange(new Date('2026-11-17T17:00:00.000Z'));
    expect(iso(before.from)).toBe('2026-11-16T17:00:00.000Z');
    expect(iso(before.to)).toBe('2026-11-17T17:00:00.000Z');
    expect(iso(after.from)).toBe('2026-11-17T17:00:00.000Z');
    expect(iso(after.to)).toBe('2026-11-18T17:00:00.000Z');
  });

  it('is a half-open 24h range containing the instant', () => {
    const now = new Date('2026-02-28T20:30:00Z');
    const r = bangkokDayRange(now);
    expect(r.to.getTime() - r.from.getTime()).toBe(86_400_000);
    expect(r.from.getTime() <= now.getTime() && now.getTime() < r.to.getTime()).toBe(true);
  });

  it('works for instants before 1970', () => {
    const r = bangkokDayRange(new Date('1969-12-31T10:00:00Z'));
    expect(iso(r.from)).toBe('1969-12-30T17:00:00.000Z');
  });
});

describe('bangkokMonthRange', () => {
  it('returns first day to first day of the next month in Bangkok time', () => {
    const r = bangkokMonthRange('2026-11');
    expect(r && [iso(r.from), iso(r.to)]).toEqual([
      '2026-10-31T17:00:00.000Z',
      '2026-11-30T17:00:00.000Z',
    ]);
  });

  it('rolls over the year in December', () => {
    const r = bangkokMonthRange('2026-12');
    expect(r && [iso(r.from), iso(r.to)]).toEqual([
      '2026-11-30T17:00:00.000Z',
      '2026-12-31T17:00:00.000Z',
    ]);
  });

  it('handles leap February', () => {
    const r = bangkokMonthRange('2028-02');
    expect(r && [iso(r.from), iso(r.to)]).toEqual([
      '2028-01-31T17:00:00.000Z',
      '2028-02-29T17:00:00.000Z',
    ]);
  });

  it('handles small years without the Date.UTC 1900 mapping', () => {
    const r = bangkokMonthRange('0050-01');
    expect(r?.from.getUTCFullYear()).toBe(49);
  });

  it('returns null for malformed input', () => {
    for (const s of [
      '',
      '2026-1',
      '2026-13',
      '2026-00',
      '26-11',
      '2026-11-01',
      ' 2026-11',
      'abcd-ef',
    ]) {
      expect(bangkokMonthRange(s), s).toBeNull();
    }
  });
});

describe('bangkokMonthOf', () => {
  it('uses the Bangkok calendar month', () => {
    expect(bangkokMonthOf(new Date('2026-11-18T05:00:00Z'))).toBe('2026-11');
    expect(bangkokMonthOf(new Date('2026-10-31T16:59:59.999Z'))).toBe('2026-10');
    expect(bangkokMonthOf(new Date('2026-10-31T17:00:00.000Z'))).toBe('2026-11');
    expect(bangkokMonthOf(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01');
  });
});

describe('requireBangkokMonthRange', () => {
  it('returns the same range as bangkokMonthRange for a valid month', () => {
    for (const m of ['2026-11', '2026-12', '2027-01']) {
      expect(requireBangkokMonthRange(m)).toEqual(bangkokMonthRange(m));
    }
    const r = requireBangkokMonthRange('2026-12');
    expect([iso(r.from), iso(r.to)]).toEqual([
      '2026-11-30T17:00:00.000Z',
      '2026-12-31T17:00:00.000Z',
    ]);
  });

  it.each(['2026-13', '2026-1', 'nov', ''])('throws for a month that is not YYYY-MM: %j', (m) => {
    expect(() => requireBangkokMonthRange(m)).toThrow('month must be YYYY-MM');
  });
});
