import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_LINE_CHANNEL_ID,
  FAKE_LINE_INVALID_TOKEN,
  FAKE_LINE_OTHER_CHANNEL_TOKEN,
  FakeClock,
  FakeLogger,
  FakeMessagingGateway,
  FakeSecretCipher,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import type { LineAccessToken } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeSetLineCredentials } from './set-line-credentials.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: null };
const SECRET = 'channel-secret-value';
const TOKEN = 'access-token-value' as LineAccessToken; // brand: test token
const CHANNEL_ID = FAKE_LINE_CHANNEL_ID;
const input = (over: { channelSecret?: string; channelAccessToken?: LineAccessToken } = {}) => ({
  channelId: CHANNEL_ID,
  channelSecret: SECRET,
  channelAccessToken: TOKEN,
  ...over,
});

describe('SetLineCredentials', () => {
  let gateway: FakeMessagingGateway;
  let cipher: FakeSecretCipher;
  let settings: FakeSettingsRepository;
  let logger: FakeLogger;
  let clock: FakeClock;
  let run: ReturnType<typeof makeSetLineCredentials>;

  beforeEach(() => {
    clock = new FakeClock();
    gateway = new FakeMessagingGateway({ channelSecret: SECRET });
    cipher = new FakeSecretCipher();
    settings = new FakeSettingsRepository();
    logger = new FakeLogger(clock);
    run = makeSetLineCredentials({ gateway, cipher, settings, clock, logger }, config);
  });

  it('saves nothing and answers line.channel_mismatch for a token of another channel', async () => {
    const result = await run(input({ channelAccessToken: FAKE_LINE_OTHER_CHANNEL_TOKEN }), ctx);

    expect(result).toEqual({ ok: false, error: { code: 'line.channel_mismatch' } });
    expect((await settings.get()).lineConfigured).toBe(false);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        event: 'line.credentials.rejected',
        errorCode: 'line.channel_mismatch',
      }),
    );
  });

  it('saves as unchecked when the bot of the Channel ID cannot be read', async () => {
    gateway.channelBotUnreadable = true;

    const result = await run(input(), ctx);

    expect(result).toMatchObject({ ok: true, value: { secretStatus: 'unchecked' } });
    expect((await settings.get()).lineSecretVerifiedAt).toBeNull();
  });

  it('saves a valid token encrypted with the verified pair and returns the bot info', async () => {
    gateway.setBotInfo({ botName: 'Shop Bot', basicId: '@shop' });

    const result = await run(input(), ctx);

    expect(result).toEqual({
      ok: true,
      value: { botName: 'Shop Bot', basicId: '@shop', secretStatus: 'verified' },
    });
    const stored = await settings.getEncryptedLineCredentials();
    expect(stored).not.toBeNull();
    expect(stored?.channelSecretEnc).not.toBe(SECRET);
    expect(stored?.channelAccessTokenEnc).not.toBe(TOKEN);
    expect(cipher.decrypt(stored?.channelSecretEnc ?? '')).toEqual({ ok: true, value: SECRET });
    expect(cipher.decrypt(stored?.channelAccessTokenEnc ?? '')).toEqual({ ok: true, value: TOKEN });
    const s = await settings.get();
    expect(s.lineConfigured).toBe(true);
    expect(s.lineBotName).toBe('Shop Bot');
    expect(s.lineChannelId).toBe(CHANNEL_ID);
    expect(s.lineSecretVerifiedAt).toEqual(clock.now());
    expect(logger.entries.at(-1)).toMatchObject({
      event: 'line.credentials.saved',
      outcome: 'verified',
    });
  });

  it("refuses a secret that is not the Channel ID's, writes nothing and says which pair", async () => {
    const result = await run(input({ channelSecret: 'someone-elses-secret' }), ctx);

    expect(result.ok ? null : result.error.code).toBe('line.channel_secret_invalid');
    expect(await settings.getEncryptedLineCredentials()).toBeNull();
    expect((await settings.get()).lineChannelId).toBeNull();
    expect(logger.entries).toMatchObject([
      { event: 'line.credentials.rejected', errorCode: 'line.channel_secret_invalid' },
    ]);
  });

  it('saves with the secret unchecked when LINE cannot check it now (429, 5xx, no network)', async () => {
    gateway.failNext('verifyChannelSecret', 'line.unavailable');

    const result = await run(input(), ctx);

    expect(result).toEqual({
      ok: true,
      value: { botName: 'Fake Bot', basicId: '@fakebot', secretStatus: 'unchecked' },
    });
    const s = await settings.get();
    expect(s.lineConfigured).toBe(true);
    expect(s.lineChannelId).toBe(CHANNEL_ID);
    expect(s.lineSecretVerifiedAt).toBeNull();
    expect(logger.entries.at(-1)).toMatchObject({
      event: 'line.credentials.saved',
      outcome: 'unchecked',
      errorCode: 'line.unavailable',
    });
  });

  it('checks the access token first: a rejected token never reaches the secret check', async () => {
    gateway.failNext('verifyChannelSecret', 'line.channel_secret_invalid');
    const result = await run(input({ channelAccessToken: FAKE_LINE_INVALID_TOKEN }), ctx);
    expect(result.ok ? null : result.error.code).toBe('line.credentials_invalid');
    // The queued failure is still there: verifyChannelSecret was not called.
    expect(await gateway.verifyChannelSecret(CHANNEL_ID, SECRET)).toMatchObject({ ok: false });
  });

  it('returns line.credentials_invalid and writes nothing for a rejected token', async () => {
    const result = await run(input({ channelAccessToken: FAKE_LINE_INVALID_TOKEN }), ctx);

    expect(result.ok ? null : result.error.code).toBe('line.credentials_invalid');
    expect(await settings.getEncryptedLineCredentials()).toBeNull();
    expect((await settings.get()).lineConfigured).toBe(false);
    expect(logger.eventsOf()).toEqual(['line.credentials.rejected']);
  });

  it('returns line.unavailable when LINE is down and writes nothing', async () => {
    gateway.failNext('getBotInfo', 'line.unavailable');

    const result = await run(input(), ctx);

    expect(result.ok ? null : result.error.code).toBe('line.unavailable');
    expect(await settings.getEncryptedLineCredentials()).toBeNull();
  });

  it('clears lastLineError once saved', async () => {
    await settings.recordLineError({ code: 'line.unauthorized', at: clock.now() });

    await run(input(), ctx);

    expect((await settings.get()).lastLineError).toBeNull();
    expect(logger.eventsOf()).toEqual(['line.credentials.saved']);
  });

  it('keeps the secret and the token out of the log', async () => {
    await run(input(), ctx);
    await run(input({ channelAccessToken: FAKE_LINE_INVALID_TOKEN }), ctx);
    await run(input({ channelSecret: `${SECRET}-wrong` }), ctx);
    gateway.failNext('verifyChannelSecret', 'line.unavailable');
    await run(input(), ctx);

    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(FAKE_LINE_INVALID_TOKEN);
  });

  describe('partial update: values left out are the stored ones', () => {
    beforeEach(async () => {
      expect((await run(input(), ctx)).ok).toBe(true);
      logger.entries.length = 0;
    });

    it('replaces only the token, checking it with the stored Channel ID and secret', async () => {
      const newToken = 'access-token-new' as LineAccessToken; // brand: test token
      const result = await run({ channelAccessToken: newToken }, ctx);

      expect(result).toMatchObject({ ok: true, value: { secretStatus: 'verified' } });
      const stored = await settings.getEncryptedLineCredentials();
      expect(cipher.decrypt(stored?.channelAccessTokenEnc ?? '')).toEqual({
        ok: true,
        value: newToken,
      });
      expect(cipher.decrypt(stored?.channelSecretEnc ?? '')).toEqual({ ok: true, value: SECRET });
      expect((await settings.get()).lineChannelId).toBe(CHANNEL_ID);
    });

    it("still refuses a new secret that is not the stored Channel ID's, and keeps the old one", async () => {
      const result = await run({ channelSecret: 'someone-elses-secret' }, ctx);

      expect(result.ok ? null : result.error.code).toBe('line.channel_secret_invalid');
      const stored = await settings.getEncryptedLineCredentials();
      expect(cipher.decrypt(stored?.channelSecretEnc ?? '')).toEqual({ ok: true, value: SECRET });
    });

    it('still refuses a new token of another channel (channel mismatch)', async () => {
      const result = await run({ channelAccessToken: FAKE_LINE_OTHER_CHANNEL_TOKEN }, ctx);

      expect(result).toEqual({ ok: false, error: { code: 'line.channel_mismatch' } });
      const stored = await settings.getEncryptedLineCredentials();
      expect(cipher.decrypt(stored?.channelAccessTokenEnc ?? '')).toEqual({
        ok: true,
        value: TOKEN,
      });
    });

    it('answers line.credentials_unreadable when the stored values cannot be decrypted', async () => {
      const other = makeSetLineCredentials(
        { gateway, cipher: new FakeSecretCipher('another-key'), settings, clock, logger },
        config,
      );
      const result = await other({ channelId: CHANNEL_ID }, ctx);

      expect(result.ok ? null : result.error.code).toBe('line.credentials_unreadable');
    });
  });

  it('answers line.not_configured for a partial update when nothing is stored, and writes nothing', async () => {
    const result = await run({ channelAccessToken: TOKEN }, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.not_configured');
    expect(await settings.getEncryptedLineCredentials()).toBeNull();
    expect(logger.entries).toMatchObject([
      { event: 'line.credentials.rejected', errorCode: 'line.not_configured' },
    ]);
  });
});
