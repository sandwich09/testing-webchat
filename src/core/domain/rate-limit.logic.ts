import { RATE_LIMIT_RULES } from './constants';
import type { RateLimitAction } from './enums.model';

export const rateWindowStart: (now: Date, windowMs: number) => Date = (now, windowMs) =>
  new Date(Math.floor(now.getTime() / windowMs) * windowMs);

export const effectiveLimit: (action: RateLimitAction, scale: number) => number = (
  action,
  scale,
) => {
  const rule = RATE_LIMIT_RULES[action];
  return rule.scaled ? rule.limit * scale : rule.limit;
};

/** Use after `hit`: the bucket count already includes the current attempt. */
export const isRateLimited: (bucket: { count: number }, limit: number) => boolean = (
  bucket,
  limit,
) => bucket.count > limit;

/** Use after `peek`: the bucket count does not include the current attempt yet. */
export const isAtLimit: (bucket: { count: number }, limit: number) => boolean = (bucket, limit) =>
  bucket.count >= limit;

export const retryAfterSeconds: (windowStart: Date, windowMs: number, now: Date) => number = (
  windowStart,
  windowMs,
  now,
) => Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
