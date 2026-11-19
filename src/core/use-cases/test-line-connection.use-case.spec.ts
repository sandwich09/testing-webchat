import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_LINE_CHANNEL_ID,
  FAKE_LINE_CHANNEL_SECRET,
  FAKE_LINE_INVALID_TOKEN,
  FakeClock,
  FakeLogger,
  FakeMessagingGateway,
  FakeSecretCipher,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { PRICE_TABLE } from '@/core/domain';
import { makeTestLineConnection } from './test-line-connection.use-case';
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

describe('TestLineConnection', () => {
  let gateway: FakeMessagingGateway;
  let cipher: FakeSecretCipher;
  let settings: FakeSettingsRepository;
  let logger: FakeLogger;
  let clock: FakeClock;
  let run: ReturnType<typeof makeTestLineConnection>;

  const store = (token: string, secret = FAKE_LINE_CHANNEL_SECRET) =>
    settings.saveLineCredentials(
      { channelSecretEnc: cipher.encrypt(secret), channelAccessTokenEnc: cipher.encrypt(token) },
      { botName: 'Old name', basicId: '@old' },
      { channelId: FAKE_LINE_CHANNEL_ID, secretVerifiedAt: null },
    );

  beforeEach(() => {
    clock = new FakeClock();
    gateway = new FakeMessagingGateway();
    cipher = new FakeSecretCipher();
    settings = new FakeSettingsRepository();
    logger = new FakeLogger(clock);
    run = makeTestLineConnection({ settings, cipher, gateway, clock, logger }, config);
  });

  it('updates the bot name and clears lastLineError when LINE accepts the token', async () => {
    await store('good-token');
    await settings.recordLineError({ code: 'line.unavailable', at: clock.now() });
    gateway.setBotInfo({ botName: 'New name', basicId: '@new' });

    const result = await run({}, ctx);

    expect(result).toEqual({
      ok: true,
      value: { botName: 'New name', basicId: '@new', secretStatus: 'verified' },
    });
    const s = await settings.get();
    expect(s.lineBotName).toBe('New name');
    expect(s.lastLineError).toBeNull();
    expect(s.lineSecretVerifiedAt).toEqual(clock.now());
    expect(logger.entries).toEqual([
      expect.objectContaining({ event: 'line.connection.tested', outcome: 'verified' }),
    ]);
  });

  it("fails with line.channel_secret_invalid when the stored secret is not the Channel ID's", async () => {
    await store('good-token', 'another-channel-secret');
    await settings.recordLineSecretCheck(new Date('2026-11-01T00:00:00Z'));

    const result = await run({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.channel_secret_invalid');
    const s = await settings.get();
    expect(s.lineSecretVerifiedAt).toBeNull();
    expect(s.lastLineError?.code).toBe('line.channel_secret_invalid');
  });

  it('reports unchecked and keeps the stored result when LINE cannot check the secret', async () => {
    await store('good-token');
    const earlier = new Date('2026-11-01T00:00:00Z');
    await settings.recordLineSecretCheck(earlier);
    gateway.failNext('verifyChannelSecret', 'line.unavailable');

    const result = await run({}, ctx);

    expect(result).toMatchObject({ ok: true, value: { secretStatus: 'unchecked' } });
    expect((await settings.get()).lineSecretVerifiedAt).toEqual(earlier);
  });

  it('reports no_channel_id for credentials saved without a Channel ID, and keeps working', async () => {
    await store('good-token');
    settings.forgetLineChannelId();
    gateway.failNext('verifyChannelSecret', 'line.channel_secret_invalid');

    const result = await run({}, ctx);

    // Nothing to check the secret against, so LINE is not asked (the queued failure stays).
    expect(result).toMatchObject({ ok: true, value: { secretStatus: 'no_channel_id' } });
    expect((await settings.get()).lastLineError).toBeNull();
    expect(logger.entries).toEqual([
      expect.objectContaining({ event: 'line.connection.tested', outcome: 'no_channel_id' }),
    ]);
  });

  it('records lastLineError when the token has been revoked', async () => {
    await store(FAKE_LINE_INVALID_TOKEN);

    const result = await run({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.credentials_invalid');
    expect((await settings.get()).lastLineError).toEqual({
      code: 'line.credentials_invalid',
      at: clock.now(),
    });
    expect(logger.entries).toEqual([
      expect.objectContaining({ event: 'line.connection.tested', outcome: 'failed' }),
    ]);
  });

  it('records line.unavailable when LINE is down', async () => {
    await store('good-token');
    gateway.failNext('getBotInfo', 'line.unavailable');

    const result = await run({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.unavailable');
    expect((await settings.get()).lastLineError?.code).toBe('line.unavailable');
  });

  it('returns line.not_configured when nothing is saved', async () => {
    const result = await run({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.not_configured');
  });

  it('returns line.credentials_unreadable when the stored values cannot be decrypted', async () => {
    await settings.saveLineCredentials(
      {
        channelSecretEnc: new FakeSecretCipher('other-key').encrypt('s'),
        channelAccessTokenEnc: new FakeSecretCipher('other-key').encrypt('t'),
      },
      { botName: 'b', basicId: '@b' },
      { channelId: '1000000001', secretVerifiedAt: null },
    );

    const result = await run({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.credentials_unreadable');
  });
});
