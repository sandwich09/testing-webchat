import { describe, expect, it } from 'vitest';
import type { NanoUsd } from './ids';
import { computeCost, formatUsd, parseUsd } from './money.logic';
import type { PriceTable } from './price.model';
import { PRICE_TABLE } from './pricing.constants';

const nano = (n: bigint): NanoUsd => n as NanoUsd;
const usage = (i: number, o: number, cr: number, cw: number) => ({
  inputTokens: i,
  outputTokens: o,
  cacheReadTokens: cr,
  cacheWriteTokens: cw,
});

describe('computeCost', () => {
  it('sums each token type times the model price', () => {
    // sonnet-5-5: 2000 / 10000 / 200 / 2500
    const r = computeCost(usage(1000, 500, 4000, 100), 'claude-sonnet-5-5', PRICE_TABLE);
    expect(r).toEqual({
      cost: 1000n * 2000n + 500n * 10_000n + 4000n * 200n + 100n * 2500n,
      priceKnown: true,
    });
  });

  it('is zero for zero usage', () => {
    expect(computeCost(usage(0, 0, 0, 0), 'claude-opus-5-5', PRICE_TABLE)).toEqual({
      cost: 0n,
      priceKnown: true,
    });
  });

  it('uses the highest price of each type for an unknown model', () => {
    const table: PriceTable = {
      asOf: '2026-11-03',
      models: {
        a: { input: 10n, output: 1n, cacheRead: 5n, cacheWrite: 1n },
        b: { input: 1n, output: 20n, cacheRead: 1n, cacheWrite: 7n },
      },
    };
    const r = computeCost(usage(1, 1, 1, 1), 'mystery', table);
    expect(r).toEqual({ cost: 10n + 20n + 5n + 7n, priceKnown: false });
  });

  it('does not treat inherited object keys as known models', () => {
    expect(computeCost(usage(1, 0, 0, 0), 'toString', PRICE_TABLE).priceKnown).toBe(false);
  });

  it('costs zero with an empty table but still reports the model as unknown', () => {
    expect(computeCost(usage(5, 5, 5, 5), 'x', { asOf: 'd', models: {} })).toEqual({
      cost: 0n,
      priceKnown: false,
    });
  });

  it('stays exact for very large token counts', () => {
    const r = computeCost(usage(Number.MAX_SAFE_INTEGER, 0, 0, 0), 'claude-opus-5-5', PRICE_TABLE);
    expect(r.cost).toBe(BigInt(Number.MAX_SAFE_INTEGER) * 4000n);
  });
});

describe('parseUsd', () => {
  it('parses whole and fractional amounts into nano-USD', () => {
    expect(parseUsd('2')).toBe(2_000_000_000n);
    expect(parseUsd('2.00')).toBe(2_000_000_000n);
    expect(parseUsd('0.5')).toBe(500_000_000n);
    expect(parseUsd('10.123456789')).toBe(10_123_456_789n);
    expect(parseUsd('999999.999999999')).toBe(999_999_999_999_999n);
    expect(parseUsd('0')).toBe(0n);
  });

  it('rejects everything outside the pattern', () => {
    for (const s of [
      '',
      '.5',
      '5.',
      '-1',
      '+1',
      '1,5',
      '1e3',
      ' 1',
      '1 ',
      '1\n',
      '1.1234567890',
      '1234567',
      '١٢',
      'abc',
    ]) {
      expect(parseUsd(s), s).toBeNull();
    }
  });
});

describe('formatUsd', () => {
  it('formats with 2 and 6 decimals', () => {
    expect(formatUsd(nano(2_000_000_000n), 2)).toBe('2.00');
    expect(formatUsd(nano(0n), 2)).toBe('0.00');
    expect(formatUsd(nano(1_234_567_891n), 6)).toBe('1.234568');
    expect(formatUsd(nano(1_000_000n), 6)).toBe('0.001000');
    expect(formatUsd(nano(1_234_567_891n), 2)).toBe('1.23');
  });

  it('rounds half up at the boundary', () => {
    expect(formatUsd(nano(4_999_999n), 2)).toBe('0.00');
    expect(formatUsd(nano(5_000_000n), 2)).toBe('0.01');
    expect(formatUsd(nano(999_999_999n), 2)).toBe('1.00');
    expect(formatUsd(nano(499n), 6)).toBe('0.000000');
    expect(formatUsd(nano(500n), 6)).toBe('0.000001');
  });

  it('handles negative amounts and avoids negative zero', () => {
    expect(formatUsd(nano(-1_500_000_000n), 2)).toBe('-1.50');
    expect(formatUsd(nano(-1n), 2)).toBe('0.00');
  });

  it('round-trips with parseUsd', () => {
    const n = parseUsd('123.456789');
    expect(n === null ? null : formatUsd(n, 6)).toBe('123.456789');
  });
});
