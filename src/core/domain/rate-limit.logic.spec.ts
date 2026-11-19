import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_RULES } from './constants';
import { RATE_LIMIT_ACTIONS } from './enums.model';
import {
  effectiveLimit,
  isAtLimit,
  isRateLimited,
  rateWindowStart,
  retryAfterSeconds,
} from './rate-limit.logic';

describe('rateWindowStart', () => {
  it('floors to the fixed window', () => {
    const w = 60_000;
    expect(rateWindowStart(new Date(125_999), w).getTime()).toBe(120_000);
    expect(rateWindowStart(new Date(120_000), w).getTime()).toBe(120_000);
    expect(rateWindowStart(new Date(119_999), w).getTime()).toBe(60_000);
  });
});

describe('effectiveLimit', () => {
  it('keeps both unlock rules unscaled and scales every other action by 10', () => {
    expect(effectiveLimit('unlock', 10)).toBe(RATE_LIMIT_RULES.unlock.limit);
    expect(effectiveLimit('unlock_no_ip', 10)).toBe(RATE_LIMIT_RULES.unlock_no_ip.limit);
    for (const action of RATE_LIMIT_ACTIONS.filter((a) => a !== 'unlock' && a !== 'unlock_no_ip')) {
      expect(effectiveLimit(action, 10)).toBe(RATE_LIMIT_RULES[action].limit * 10);
    }
  });

  it('uses scale 1 as identity', () => {
    expect(effectiveLimit('send_message', 1)).toBe(RATE_LIMIT_RULES.send_message.limit);
  });
});

describe('isRateLimited (after hit)', () => {
  it('is true only above the limit', () => {
    expect(isRateLimited({ count: 4 }, 5)).toBe(false);
    expect(isRateLimited({ count: 5 }, 5)).toBe(false);
    expect(isRateLimited({ count: 6 }, 5)).toBe(true);
  });
});

describe('isAtLimit (after peek)', () => {
  it('is true at and above the limit', () => {
    expect(isAtLimit({ count: 4 }, 5)).toBe(false);
    expect(isAtLimit({ count: 5 }, 5)).toBe(true);
    expect(isAtLimit({ count: 6 }, 5)).toBe(true);
  });
});

describe('retryAfterSeconds', () => {
  const start = new Date(120_000);
  it('rounds the remaining time up', () => {
    expect(retryAfterSeconds(start, 60_000, new Date(120_000))).toBe(60);
    expect(retryAfterSeconds(start, 60_000, new Date(150_001))).toBe(30);
    expect(retryAfterSeconds(start, 60_000, new Date(179_001))).toBe(1);
  });

  it('is at least 1 at or after the window end', () => {
    expect(retryAfterSeconds(start, 60_000, new Date(180_000))).toBe(1);
    expect(retryAfterSeconds(start, 60_000, new Date(500_000))).toBe(1);
  });
});
