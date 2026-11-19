import { describe, expect, it } from 'vitest';
import type { NanoUsd } from '@/core/domain';
import { decimalStringToNano, nanoToDecimalString } from './money.mapper';

const nano = (n: bigint): NanoUsd => n as NanoUsd; // brand: test amount

describe('money.mapper', () => {
  it('converts Decimal(18, 9) strings to nano-USD exactly', () => {
    expect(decimalStringToNano('2.000000000')).toBe(2_000_000_000n);
    expect(decimalStringToNano('0.000000001')).toBe(1n);
    expect(decimalStringToNano('123456789.012345678')).toBe(123_456_789_012_345_678n);
    expect(decimalStringToNano('7')).toBe(7_000_000_000n);
    expect(decimalStringToNano('0.5')).toBe(500_000_000n);
    expect(decimalStringToNano('-1.5')).toBe(-1_500_000_000n);
  });

  it('writes nano-USD as a 9-digit decimal string', () => {
    expect(nanoToDecimalString(nano(0n))).toBe('0.000000000');
    expect(nanoToDecimalString(nano(1n))).toBe('0.000000001');
    expect(nanoToDecimalString(nano(123_456_789_012_345_678n))).toBe('123456789.012345678');
    expect(nanoToDecimalString(nano(-1_500_000_000n))).toBe('-1.500000000');
  });

  it('round-trips', () => {
    for (const n of [0n, 1n, 999_999_999n, 1_000_000_000n, 9_007_199_254_740_993n]) {
      expect(decimalStringToNano(nanoToDecimalString(nano(n)))).toBe(n);
    }
  });

  it('rejects input that is not a plain decimal or would lose digits', () => {
    expect(() => decimalStringToNano('1e5')).toThrow();
    expect(() => decimalStringToNano('0.0000000001')).toThrow();
    expect(decimalStringToNano('0.1000000000')).toBe(100_000_000n);
  });
});
