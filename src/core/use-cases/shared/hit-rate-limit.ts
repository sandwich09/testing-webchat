import type { RateLimitAction } from '@/core/domain';
import {
  RATE_LIMIT_RULES,
  effectiveLimit,
  isRateLimited,
  rateWindowStart,
  retryAfterSeconds,
} from '@/core/domain';
import type { ContentHasher } from '@/core/ports';
import type { AllPorts, UseCaseConfig } from '../types';

export type HitRateLimitDeps = Pick<AllPorts, 'rateLimits' | 'hasher'>;

export type RateLimitCheck = { limited: false } | { limited: true; retryAfterSeconds: number };

/** Counts one hit and reports whether the limit is exceeded. */
export type HitRateLimit = (
  action: RateLimitAction,
  subject: string,
  now: Date,
) => Promise<RateLimitCheck>;

/**
 * Bucket key for one action and subject. The subject (an IP, a contact id) is keyed-hashed so
 * no raw IP is ever stored. Shared with checkRateLimit so peek reads the bucket hit writes.
 */
export const rateLimitKey = (
  hasher: ContentHasher,
  action: RateLimitAction,
  subject: string,
): string => `${action}:${hasher.keyedHash(subject)}`;

export const makeHitRateLimit: (
  deps: HitRateLimitDeps,
  config: Pick<UseCaseConfig, 'rateLimitScale'>,
) => HitRateLimit =
  ({ rateLimits, hasher }, { rateLimitScale }) =>
  async (action, subject, now) => {
    const rule = RATE_LIMIT_RULES[action];
    const limit = effectiveLimit(action, rateLimitScale);
    const windowStart = rateWindowStart(now, rule.windowMs);
    const bucket = await rateLimits.hit(rateLimitKey(hasher, action, subject), windowStart);
    if (!isRateLimited(bucket, limit)) return { limited: false };
    return { limited: true, retryAfterSeconds: retryAfterSeconds(windowStart, rule.windowMs, now) };
  };
