import type { LineAccessToken } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type SetLineCredentialsInput = {
  channelSecret: string;
  channelAccessToken: LineAccessToken;
};

export type SetLineCredentialsOutput = { botName: string; basicId: string };

export type SetLineCredentialsDeps = Pick<
  AllPorts,
  'gateway' | 'cipher' | 'settings' | 'clock' | 'logger'
>;

/** Checks the access token with LINE, then stores both values encrypted. */
export const makeSetLineCredentials: (
  deps: SetLineCredentialsDeps,
  config: UseCaseConfig,
) => UseCase<
  SetLineCredentialsInput,
  SetLineCredentialsOutput,
  'line.credentials_invalid' | 'line.unavailable'
> =
  ({ gateway, cipher, settings, logger }) =>
  async ({ channelSecret, channelAccessToken }, ctx) => {
    const bot = await gateway.getBotInfo(channelAccessToken);
    if (!bot.ok) {
      logger.log('warn', 'line.credentials.rejected', {
        requestId: ctx.requestId,
        errorCode: bot.error.code,
      });
      return err(bot.error.code);
    }

    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(channelSecret),
        channelAccessTokenEnc: cipher.encrypt(channelAccessToken),
      },
      bot.value,
    );
    await settings.recordLineError(null);
    logger.log('info', 'line.credentials.saved', { requestId: ctx.requestId });
    return ok(bot.value);
  };
