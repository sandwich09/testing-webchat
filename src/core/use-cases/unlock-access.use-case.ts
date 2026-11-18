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

/** Only wrong codes count toward the limit, so a right code never uses up an attempt. */
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
    const subject = ctx.clientIp ?? 'unknown';

    const check = await checkRateLimit('unlock', subject, now);
    if (check.limited) {
      logger.log('warn', 'access.unlock.rate_limited', { requestId: ctx.requestId });
      return err('access.rate_limited', undefined, check.retryAfterSeconds);
    }

    if (!signer.checkCode(code)) {
      await hitRateLimit('unlock', subject, now);
      logger.log('warn', 'access.unlock.failed', { requestId: ctx.requestId });
      return err('access.code_invalid');
    }

    const issued = signer.issue(now);
    logger.log('info', 'access.unlock.succeeded', { requestId: ctx.requestId });
    return ok(issued);
  };
};
