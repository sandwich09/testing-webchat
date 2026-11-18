import type { PriceTable } from './price.model';

// nano-USD per token = USD per million tokens x 1000. Source: docs/specs/usage-cost.md.
// Cache read/write prices and the fallback models (claude-opus-5, claude-opus-4-8, claude-sonnet-5)
// are marked "to be confirmed against the current price page" in that doc.
export const PRICE_TABLE: PriceTable = {
  asOf: '2026-11-03',
  models: {
    'claude-opus-5-5': { input: 4000n, output: 20_000n, cacheRead: 400n, cacheWrite: 5000n },
    'claude-sonnet-5-5': { input: 2000n, output: 10_000n, cacheRead: 200n, cacheWrite: 2500n },
    'claude-haiku-5-5': { input: 100n, output: 500n, cacheRead: 10n, cacheWrite: 125n },
    'claude-opus-5': { input: 5000n, output: 25_000n, cacheRead: 500n, cacheWrite: 6250n },
    'claude-opus-4-8': { input: 5000n, output: 25_000n, cacheRead: 500n, cacheWrite: 6250n },
    'claude-sonnet-5': { input: 2000n, output: 10_000n, cacheRead: 200n, cacheWrite: 2500n },
  },
};
