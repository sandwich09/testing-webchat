import { beforeEach, describe, expect, it } from 'vitest';
import {
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

  const store = (token: string) =>
    settings.saveLineCredentials(
      { channelSecretEnc: cipher.encrypt('secret'), channelAccessTokenEnc: cipher.encrypt(token) },
      { botName: 'Old name', basicId: '@old' },
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

    expect(result).toEqual({ ok: true, value: { botName: 'New name', basicId: '@new' } });
    const s = await settings.get();
    expect(s.lineBotName).toBe('New name');
    expect(s.lastLineError).toBeNull();
    expect(logger.entries).toEqual([
      expect.objectContaining({ event: 'line.connection.tested', outcome: 'ok' }),
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
    );

    const result = await run({}, ctx);

    expect(result.ok ? null : result.error.code).toBe('line.credentials_unreadable');
  });
});
