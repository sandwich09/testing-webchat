import { err, ok } from '@/core/domain';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type TestLineConnectionInput = Record<string, never>;

export type TestLineConnectionOutput = { botName: string; basicId: string };

export type TestLineConnectionDeps = Pick<
  AllPorts,
  'settings' | 'cipher' | 'gateway' | 'clock' | 'logger'
>;

/** Asks LINE who the stored access token belongs to and records the outcome. */
export const makeTestLineConnection: (
  deps: TestLineConnectionDeps,
  config: UseCaseConfig,
) => UseCase<
  TestLineConnectionInput,
  TestLineConnectionOutput,
  | 'line.not_configured'
  | 'line.credentials_unreadable'
  | 'line.credentials_invalid'
  | 'line.unavailable'
> = (deps) => {
  const { settings, gateway, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  return async (_input, ctx) => {
    const access = await loadLineAccess();
    if (!access.ok) return err(access.error.code);

    const bot = await gateway.getBotInfo(access.value.channelAccessToken);
    if (!bot.ok) {
      await settings.recordLineError({ code: bot.error.code, at: clock.now() });
      logger.log('warn', 'line.connection.tested', {
        requestId: ctx.requestId,
        outcome: 'failed',
        errorCode: bot.error.code,
      });
      return err(bot.error.code);
    }

    await settings.updateLineBotInfo(bot.value);
    await settings.recordLineError(null);
    logger.log('info', 'line.connection.tested', { requestId: ctx.requestId, outcome: 'ok' });
    return ok(bot.value);
  };
};
