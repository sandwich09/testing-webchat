import type { LineAccessToken, LineSecretStatus, Result } from '@/core/domain';
import { err, ok } from '@/core/domain';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

/**
 * The values the admin changed; at least one (the contract checks it). A value left out is taken
 * from what is stored, so the three are always checked together with LINE.
 */
export type SetLineCredentialsInput = {
  /** Digits only, checked by the contract. Not secret. */
  channelId?: string;
  channelSecret?: string;
  channelAccessToken?: LineAccessToken;
};

export type SetLineCredentialsOutput = {
  botName: string;
  basicId: string;
  /** `unchecked`: LINE could not check the secret now; the values are saved all the same. */
  secretStatus: Exclude<LineSecretStatus, 'no_channel_id'>;
};

export type SetLineCredentialsDeps = Pick<
  AllPorts,
  'gateway' | 'cipher' | 'settings' | 'clock' | 'logger'
>;

type FullCredentials = {
  channelId: string;
  channelSecret: string;
  channelAccessToken: LineAccessToken;
};

/**
 * Checks the access token and the Channel ID with channel secret pair with LINE, then stores them
 * (the two secrets encrypted). Values left out of the input are the stored ones: none stored
 * gives line.not_configured, stored secrets that cannot be decrypted line.credentials_unreadable. A pair LINE refuses is not saved, nor a token of another channel
 * than the pair (its bot differs from the pair's bot: every webhook would then fail its
 * signature). A check LINE cannot answer (429, 5xx, no network, the pair's bot unreadable) does
 * not block the save and leaves the secret unchecked.
 */
export const makeSetLineCredentials: (
  deps: SetLineCredentialsDeps,
  config: UseCaseConfig,
) => UseCase<
  SetLineCredentialsInput,
  SetLineCredentialsOutput,
  | 'line.credentials_invalid'
  | 'line.channel_secret_invalid'
  | 'line.channel_mismatch'
  | 'line.unavailable'
  | 'line.not_configured'
  | 'line.credentials_unreadable'
> = ({ gateway, cipher, settings, clock, logger }) => {
  const loadLineAccess = makeLoadLineAccess({ settings, cipher, logger });

  /** The input completed with the stored values it left out. */
  const complete = async (
    input: SetLineCredentialsInput,
  ): Promise<Result<FullCredentials, 'line.not_configured' | 'line.credentials_unreadable'>> => {
    const { channelId, channelSecret, channelAccessToken } = input;
    if (
      channelId !== undefined &&
      channelSecret !== undefined &&
      channelAccessToken !== undefined
    ) {
      return ok({ channelId, channelSecret, channelAccessToken });
    }
    const storedId = channelId ?? (await settings.get()).lineChannelId;
    if (storedId === null) return err('line.not_configured');
    if (channelSecret !== undefined && channelAccessToken !== undefined) {
      return ok({ channelId: storedId, channelSecret, channelAccessToken });
    }
    const stored = await loadLineAccess();
    if (!stored.ok) return stored;
    return ok({
      channelId: storedId,
      channelSecret: channelSecret ?? stored.value.channelSecret,
      channelAccessToken: channelAccessToken ?? stored.value.channelAccessToken,
    });
  };

  return async (input, ctx) => {
    const full = await complete(input);
    if (!full.ok) {
      logger.log('warn', 'line.credentials.rejected', {
        requestId: ctx.requestId,
        errorCode: full.error.code,
      });
      return full;
    }
    const { channelId, channelSecret, channelAccessToken } = full.value;
    const bot = await gateway.getBotInfo(channelAccessToken);
    if (!bot.ok) {
      logger.log('warn', 'line.credentials.rejected', {
        requestId: ctx.requestId,
        errorCode: bot.error.code,
      });
      return err(bot.error.code);
    }

    const secret = await gateway.verifyChannelSecret(channelId, channelSecret);
    if (!secret.ok && secret.error.code === 'line.channel_secret_invalid') {
      logger.log('warn', 'line.credentials.rejected', {
        requestId: ctx.requestId,
        errorCode: secret.error.code,
      });
      return err(secret.error.code);
    }
    const channelBot = secret.ok ? secret.value.bot : null;
    if (channelBot !== null && channelBot.botUserId !== bot.value.botUserId) {
      logger.log('warn', 'line.credentials.rejected', {
        requestId: ctx.requestId,
        errorCode: 'line.channel_mismatch',
      });
      return err('line.channel_mismatch');
    }
    const verified = channelBot !== null;
    const secretStatus = verified ? 'verified' : 'unchecked';
    const botInfo = { botName: bot.value.botName, basicId: bot.value.basicId };

    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(channelSecret),
        channelAccessTokenEnc: cipher.encrypt(channelAccessToken),
      },
      botInfo,
      { channelId, secretVerifiedAt: verified ? clock.now() : null },
    );
    await settings.recordLineError(null);
    logger.log('info', 'line.credentials.saved', {
      requestId: ctx.requestId,
      outcome: secretStatus,
      ...(secret.ok ? {} : { errorCode: secret.error.code }),
    });
    return ok({ ...botInfo, secretStatus });
  };
};
