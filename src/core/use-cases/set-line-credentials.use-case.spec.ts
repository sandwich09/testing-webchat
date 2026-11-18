import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_LINE_INVALID_TOKEN,
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

describe('SetLineCredentials', () => {
  let gateway: FakeMessagingGateway;
  let cipher: FakeSecretCipher;
  let settings: FakeSettingsRepository;
  let logger: FakeLogger;
  let clock: FakeClock;
  let run: ReturnType<typeof makeSetLineCredentials>;

  beforeEach(() => {
    clock = new FakeClock();
    gateway = new FakeMessagingGateway();
    cipher = new FakeSecretCipher();
    settings = new FakeSettingsRepository();
    logger = new FakeLogger(clock);
    run = makeSetLineCredentials({ gateway, cipher, settings, clock, logger }, config);
  });

  it('saves a valid token encrypted and returns the bot info', async () => {
    gateway.setBotInfo({ botName: 'Shop Bot', basicId: '@shop' });

    const result = await run({ channelSecret: SECRET, channelAccessToken: TOKEN }, ctx);

    expect(result).toEqual({ ok: true, value: { botName: 'Shop Bot', basicId: '@shop' } });
    const stored = await settings.getEncryptedLineCredentials();
    expect(stored).not.toBeNull();
    expect(stored?.channelSecretEnc).not.toBe(SECRET);
    expect(stored?.channelAccessTokenEnc).not.toBe(TOKEN);
    expect(cipher.decrypt(stored?.channelSecretEnc ?? '')).toEqual({ ok: true, value: SECRET });
    expect(cipher.decrypt(stored?.channelAccessTokenEnc ?? '')).toEqual({ ok: true, value: TOKEN });
    const s = await settings.get();
    expect(s.lineConfigured).toBe(true);
    expect(s.lineBotName).toBe('Shop Bot');
  });

  it('returns line.credentials_invalid and writes nothing for a rejected token', async () => {
    const result = await run(
      { channelSecret: SECRET, channelAccessToken: FAKE_LINE_INVALID_TOKEN },
      ctx,
    );

    expect(result.ok ? null : result.error.code).toBe('line.credentials_invalid');
    expect(await settings.getEncryptedLineCredentials()).toBeNull();
    expect((await settings.get()).lineConfigured).toBe(false);
    expect(logger.eventsOf()).toEqual(['line.credentials.rejected']);
  });

  it('returns line.unavailable when LINE is down and writes nothing', async () => {
    gateway.failNext('getBotInfo', 'line.unavailable');

    const result = await run({ channelSecret: SECRET, channelAccessToken: TOKEN }, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.unavailable');
    expect(await settings.getEncryptedLineCredentials()).toBeNull();
  });

  it('clears lastLineError once saved', async () => {
    await settings.recordLineError({ code: 'line.unauthorized', at: clock.now() });

    await run({ channelSecret: SECRET, channelAccessToken: TOKEN }, ctx);

    expect((await settings.get()).lastLineError).toBeNull();
    expect(logger.eventsOf()).toEqual(['line.credentials.saved']);
  });

  it('keeps the secret and the token out of the log', async () => {
    await run({ channelSecret: SECRET, channelAccessToken: TOKEN }, ctx);
    await run({ channelSecret: SECRET, channelAccessToken: FAKE_LINE_INVALID_TOKEN }, ctx);

    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain(SECRET);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain(FAKE_LINE_INVALID_TOKEN);
  });
});
