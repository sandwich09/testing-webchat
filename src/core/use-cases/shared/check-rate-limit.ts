import type { RateLimitAction } from '@/core/domain';
import {
  RATE_LIMIT_RULES,
  effectiveLimit,
  isAtLimit,
  rateWindowStart,
  retryAfterSeconds,
} from '@/core/domain';
import type { AllPorts, UseCaseConfig } from '../types';
import { type RateLimitCheck, rateLimitKey } from './hit-rate-limit';

export type CheckRateLimitDeps = Pick<AllPorts, 'rateLimits' | 'hasher'>;

/** Like HitRateLimit but read only (peek) and judged by isAtLimit. */
export type CheckRateLimit = (
  action: RateLimitAction,
  subject: string,
  now: Date,
) => Promise<RateLimitCheck>;

export const makeCheckRateLimit: (
  deps: CheckRateLimitDeps,
  config: Pick<UseCaseConfig, 'rateLimitScale'>,
) => CheckRateLimit =
  ({ rateLimits, hasher }, { rateLimitScale }) =>
  async (action, subject, now) => {
    const rule = RATE_LIMIT_RULES[action];
    const limit = effectiveLimit(action, rateLimitScale);
    const windowStart = rateWindowStart(now, rule.windowMs);
    const bucket = await rateLimits.peek(rateLimitKey(hasher, action, subject), windowStart);
    if (!isAtLimit(bucket, limit)) return { limited: false };
    return { limited: true, retryAfterSeconds: retryAfterSeconds(windowStart, rule.windowMs, now) };
  };
