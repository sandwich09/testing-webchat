import type { NanoUsd } from './ids';
import type { ModelPrice, PriceTable } from './price.model';
import type { TokenUsage } from './usage.model';

const NANO_PER_USD = 1_000_000_000n;

const highestPrice = (table: PriceTable): ModelPrice => {
  const prices = Object.values(table.models);
  const max = (pick: (p: ModelPrice) => bigint): bigint =>
    prices.reduce((acc, p) => (pick(p) > acc ? pick(p) : acc), 0n);
  return {
    input: max((p) => p.input),
    output: max((p) => p.output),
    cacheRead: max((p) => p.cacheRead),
    cacheWrite: max((p) => p.cacheWrite),
  };
};

export const computeCost: (
  usage: TokenUsage,
  model: string,
  table: PriceTable,
) => { cost: NanoUsd; priceKnown: boolean } = (usage, model, table) => {
  const known = Object.hasOwn(table.models, model) ? table.models[model] : undefined;
  const price = known ?? highestPrice(table);
  const cost =
    BigInt(usage.inputTokens) * price.input +
    BigInt(usage.outputTokens) * price.output +
    BigInt(usage.cacheReadTokens) * price.cacheRead +
    BigInt(usage.cacheWriteTokens) * price.cacheWrite;
  return { cost: cost as NanoUsd, priceKnown: known !== undefined };
};

const USD_PATTERN = /^(\d{1,6})(?:\.(\d{1,9}))?$/;

export const parseUsd: (s: string) => NanoUsd | null = (s) => {
  const m = USD_PATTERN.exec(s);
  if (m === null) return null;
  const whole = BigInt(m[1] ?? '0');
  const frac = BigInt((m[2] ?? '').padEnd(9, '0'));
  return (whole * NANO_PER_USD + frac) as NanoUsd;
};

export const formatUsd: (n: NanoUsd, decimals: 2 | 6) => string = (n, decimals) => {
  const raw: bigint = n;
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const unit = 10n ** BigInt(9 - decimals);
  const scaled = (abs + unit / 2n) / unit; // round half up (away from zero for negatives)
  const perUsd = 10n ** BigInt(decimals);
  const whole = scaled / perUsd;
  const frac = (scaled % perUsd).toString().padStart(decimals, '0');
  return `${negative && scaled > 0n ? '-' : ''}${whole.toString()}.${frac}`;
};
