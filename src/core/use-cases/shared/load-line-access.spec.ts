import { beforeEach, describe, expect, it } from 'vitest';
import { FakeLogger, FakeSecretCipher, FakeSettingsRepository } from '@/adapters/fakes';
import { makeLoadLineAccess, type LoadLineAccess } from './load-line-access';

const BOT = { botName: 'Bot', basicId: '@bot' };

describe('loadLineAccess', () => {
  let settings: FakeSettingsRepository;
  let cipher: FakeSecretCipher;
  let logger: FakeLogger;
  let load: LoadLineAccess;

  beforeEach(() => {
    settings = new FakeSettingsRepository();
    cipher = new FakeSecretCipher();
    logger = new FakeLogger();
    load = makeLoadLineAccess({ settings, cipher, logger });
  });

  it('returns line.not_configured when no credentials are stored', async () => {
    const result = await load();

    expect(result.ok ? null : result.error.code).toBe('line.not_configured');
    expect(logger.entries).toEqual([]);
  });

  it('decrypts both stored values', async () => {
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt('secret-1'),
        channelAccessTokenEnc: cipher.encrypt('token-1'),
      },
      BOT,
      { channelId: '1000000001', secretVerifiedAt: null },
    );

    expect(await load()).toEqual({
      ok: true,
      value: { channelSecret: 'secret-1', channelAccessToken: 'token-1' },
    });
  });

  it.each([
    ['the channel secret', { secret: 'other-key', token: 'same-key' }],
    ['the access token', { secret: 'same-key', token: 'other-key' }],
  ])(
    'returns line.credentials_unreadable and logs when %s cannot be decrypted',
    async (_, keys) => {
      const same = new FakeSecretCipher('same-key');
      const other = new FakeSecretCipher('other-key');
      const pick = (k: string) => (k === 'same-key' ? same : other);
      load = makeLoadLineAccess({ settings, cipher: same, logger });
      await settings.saveLineCredentials(
        {
          channelSecretEnc: pick(keys.secret).encrypt('secret-1'),
          channelAccessTokenEnc: pick(keys.token).encrypt('token-1'),
        },
        BOT,
        { channelId: '1000000001', secretVerifiedAt: null },
      );

      const result = await load();

      expect(result.ok ? null : result.error.code).toBe('line.credentials_unreadable');
      expect(logger.entries).toEqual([
        expect.objectContaining({
          level: 'error',
          event: 'line.credentials.unreadable',
          errorCode: 'secret.decrypt_failed',
        }),
      ]);
      const dump = JSON.stringify(logger.entries);
      expect(dump).not.toContain('secret-1');
      expect(dump).not.toContain('token-1');
    },
  );
});
