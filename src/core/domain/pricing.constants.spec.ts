import { describe, expect, it } from 'vitest';
import { PRICE_TABLE } from './pricing.constants';

describe('PRICE_TABLE', () => {
  it('has a reference date', () => {
    expect(PRICE_TABLE.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('prices the three selectable models', () => {
    for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
      expect(PRICE_TABLE.models[id]).toBeDefined();
    }
  });

  it('holds every price as a positive bigint', () => {
    for (const price of Object.values(PRICE_TABLE.models)) {
      for (const value of [price.input, price.output, price.cacheRead, price.cacheWrite]) {
        expect(typeof value).toBe('bigint');
        expect(value > 0n).toBe(true);
      }
    }
  });

  it('matches the published per-million prices (nano-USD per token = USD per million x 1000)', () => {
    expect(PRICE_TABLE.models['claude-opus-5-5']).toEqual({
      input: 4000n,
      output: 20_000n,
      cacheRead: 400n,
      cacheWrite: 5000n,
    });
    expect(PRICE_TABLE.models['claude-haiku-5-5']?.cacheWrite).toBe(125n);
  });
});
