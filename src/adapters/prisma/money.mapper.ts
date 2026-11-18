import type { NanoUsd } from '@/core/domain';

const NANO_DIGITS = 9;
const NANO_PER_USD = 1_000_000_000n;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/** A fixed-point decimal string of the database ("2.000000000", "0.5") to nano-USD, exactly. */
export function decimalStringToNano(s: string): NanoUsd {
  const m = DECIMAL_PATTERN.exec(s);
  if (m === null) throw new Error('money.mapper: not a plain decimal string');
  const [, sign, whole, fraction = ''] = m;
  if (fraction.length > NANO_DIGITS && /[1-9]/.test(fraction.slice(NANO_DIGITS))) {
    throw new Error('money.mapper: more than 9 fraction digits');
  }
  const frac = BigInt(fraction.slice(0, NANO_DIGITS).padEnd(NANO_DIGITS, '0'));
  const value = BigInt(whole ?? '0') * NANO_PER_USD + frac;
  return (sign === '-' ? -value : value) as NanoUsd; // brand: exact conversion of a Decimal(18, 9) value
}

/** Nano-USD to the decimal string Prisma accepts for a Decimal(18, 9) column, exactly. */
export function nanoToDecimalString(n: NanoUsd): string {
  const raw: bigint = n;
  const abs = raw < 0n ? -raw : raw;
  const whole = (abs / NANO_PER_USD).toString();
  const frac = (abs % NANO_PER_USD).toString().padStart(NANO_DIGITS, '0');
  return `${raw < 0n ? '-' : ''}${whole}.${frac}`;
}
