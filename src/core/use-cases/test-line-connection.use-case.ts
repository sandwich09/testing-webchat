import type { LineSecretStatus } from '@/core/domain';
import { err, ok } from '@/core/domain';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type TestLineConnectionInput = Record<string, never>;

export type TestLineConnectionOutput = {
  botName: string;
  basicId: string;
  /**
   * The secret check of this test: `verified` by LINE now, `unchecked` when LINE could not
   * answer, `no_channel_id` when none is stored and nothing could be checked.
   */
  secretStatus: LineSecretStatus;
};

export type TestLineConnectionDeps = Pick<
  AllPorts,
  'settings' | 'cipher' | 'gateway' | 'clock' | 'logger'
>;

/**
 * Asks LINE who the stored access token belongs to and whether the stored channel secret belongs
 * to the stored Channel ID, and records the outcome.
 */
export const makeTestLineConnection: (
  deps: TestLineConnectionDeps,
  config: UseCaseConfig,
) => UseCase<
  TestLineConnectionInput,
  TestLineConnectionOutput,
  | 'line.not_configured'
  | 'line.credentials_unreadable'
  | 'line.credentials_invalid'
  | 'line.channel_secret_invalid'
  | 'line.unavailable'
> = (deps) => {
  const { settings, gateway, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  const failed = async (
    code: 'line.credentials_invalid' | 'line.channel_secret_invalid' | 'line.unavailable',
    requestId: string,
  ) => {
    await settings.recordLineError({ code, at: clock.now() });
    logger.log('warn', 'line.connection.tested', { requestId, outcome: 'failed', errorCode: code });
    return err(code);
  };

  return async (_input, ctx) => {
    const access = await loadLineAccess();
    if (!access.ok) return err(access.error.code);

    const bot = await gateway.getBotInfo(access.value.channelAccessToken);
    if (!bot.ok) return failed(bot.error.code, ctx.requestId);
    await settings.updateLineBotInfo(bot.value);

    const { lineChannelId } = await settings.get();
    let secretStatus: LineSecretStatus = 'no_channel_id';
    if (lineChannelId !== null) {
      const secret = await gateway.verifyChannelSecret(lineChannelId, access.value.channelSecret);
      if (!secret.ok && secret.error.code === 'line.channel_secret_invalid') {
        await settings.recordLineSecretCheck(null);
        return failed(secret.error.code, ctx.requestId);
      }
      // A check LINE could not answer leaves the stored result as it was.
      if (secret.ok) await settings.recordLineSecretCheck(clock.now());
      secretStatus = secret.ok ? 'verified' : 'unchecked';
    }

    await settings.recordLineError(null);
    logger.log('info', 'line.connection.tested', {
      requestId: ctx.requestId,
      outcome: secretStatus,
    });
    return ok({ ...bot.value, secretStatus });
  };
};
