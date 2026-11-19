import { err, ok } from '@/core/domain';
import { makeCheckRateLimit } from './shared/check-rate-limit';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type UnlockAccessInput = { code: string };

export type UnlockAccessOutput = { token: string; expiresAt: Date };

export type UnlockAccessDeps = Pick<
  AllPorts,
  'rateLimits' | 'hasher' | 'signer' | 'clock' | 'logger'
>;

/** Bucket subject of every request without a usable caller IP. Never a value clientIpOf returns. */
export const NO_CLIENT_IP_SUBJECT = 'no-client-ip';

/**
 * Only wrong codes count toward the limit, so a right code never uses up an attempt. A request
 * with a caller IP is counted per IP (`unlock`). Requests without one cannot be told apart, so
 * they share one stricter bucket (`unlock_no_ip`): guessing stays bounded, and callers that do
 * have an IP are never affected when that bucket is full. Each such request is logged so a
 * proxy that stopped sending the address is noticed.
 */
export const makeUnlockAccess: (
  deps: UnlockAccessDeps,
  config: UseCaseConfig,
) => UseCase<
  UnlockAccessInput,
  UnlockAccessOutput,
  'access.rate_limited' | 'access.code_invalid'
> = (deps, config) => {
  const { signer, clock, logger } = deps;
  const checkRateLimit = makeCheckRateLimit(deps, config);
  const hitRateLimit = makeHitRateLimit(deps, config);

  return async ({ code }, ctx) => {
    const now = clock.now();
    const action = ctx.clientIp === null ? 'unlock_no_ip' : 'unlock';
    const subject = ctx.clientIp ?? NO_CLIENT_IP_SUBJECT;
    if (ctx.clientIp === null) {
      logger.log('warn', 'access.unlock.client_ip_missing', { requestId: ctx.requestId });
    }

    const check = await checkRateLimit(action, subject, now);
    if (check.limited) {
      logger.log('warn', 'access.unlock.rate_limited', { requestId: ctx.requestId });
      return err('access.rate_limited', undefined, check.retryAfterSeconds);
    }

    if (!signer.checkCode(code)) {
      await hitRateLimit(action, subject, now);
      logger.log('warn', 'access.unlock.failed', { requestId: ctx.requestId });
      return err('access.code_invalid');
    }

    const issued = signer.issue(now);
    logger.log('info', 'access.unlock.succeeded', { requestId: ctx.requestId });
    return ok(issued);
  };
};
