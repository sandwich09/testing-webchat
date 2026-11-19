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
 * no raw IP is ever stored. Shared with refundRateLimit so a refund reaches the bucket hit wrote.
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

/** Takes back one hit of the current window, for a result that should not count (a right code). */
export type RefundRateLimit = (
  action: RateLimitAction,
  subject: string,
  now: Date,
) => Promise<void>;

export const makeRefundRateLimit: (deps: HitRateLimitDeps) => RefundRateLimit =
  ({ rateLimits, hasher }) =>
  (action, subject, now) =>
    rateLimits.refund(
      rateLimitKey(hasher, action, subject),
      rateWindowStart(now, RATE_LIMIT_RULES[action].windowMs),
    );
