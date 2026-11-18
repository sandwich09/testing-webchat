import type { LineAccessToken, LineCredentials, Result } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts } from '../types';

export type LoadLineAccessDeps = Pick<AllPorts, 'settings' | 'cipher' | 'logger'>;

export type LoadLineAccess = () => Promise<
  Result<LineCredentials, 'line.not_configured' | 'line.credentials_unreadable'>
>;

/** Reads and decrypts the LINE channel secret and access token. Plain values stay in memory. */
export const makeLoadLineAccess: (deps: LoadLineAccessDeps) => LoadLineAccess =
  ({ settings, cipher, logger }) =>
  async () => {
    const encrypted = await settings.getEncryptedLineCredentials();
    if (encrypted === null) return err('line.not_configured');

    const channelSecret = cipher.decrypt(encrypted.channelSecretEnc);
    const channelAccessToken = cipher.decrypt(encrypted.channelAccessTokenEnc);
    if (!channelSecret.ok || !channelAccessToken.ok) {
      logger.log('error', 'line.credentials.unreadable', { errorCode: 'secret.decrypt_failed' });
      return err('line.credentials_unreadable');
    }

    return ok({
      channelSecret: channelSecret.value,
      channelAccessToken: channelAccessToken.value as LineAccessToken, // brand: decrypted from the stored access token
    });
  };
