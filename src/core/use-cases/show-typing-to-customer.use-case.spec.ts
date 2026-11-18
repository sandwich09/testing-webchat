import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, LineUserId } from '@/core/domain';
import { LINE_LOADING_SECONDS, PRICE_TABLE, RATE_LIMIT_TYPING } from '@/core/domain';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FakeClock,
  FakeContactRepository,
  FakeContentHasher,
  FakeIdGenerator,
  FakeLogger,
  FakeMessagingGateway,
  FakeRateLimitRepository,
  FakeSecretCipher,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { makeShowTypingToCustomer } from './show-typing-to-customer.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: '203.0.113.7' };
const LINE_USER = 'U-customer-1' as LineUserId; // brand: test id

describe('ShowTypingToCustomer', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let settings: FakeSettingsRepository;
  let cipher: FakeSecretCipher;
  let gateway: FakeMessagingGateway;
  let logger: FakeLogger;
  let typing: ReturnType<typeof makeShowTypingToCustomer>;

  const build = () =>
    makeShowTypingToCustomer(
      {
        contacts,
        settings,
        cipher,
        gateway,
        rateLimits: new FakeRateLimitRepository(),
        hasher: new FakeContentHasher(),
        clock,
        logger,
      },
      config,
    );

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    settings = new FakeSettingsRepository();
    cipher = new FakeSecretCipher();
    gateway = new FakeMessagingGateway();
    logger = new FakeLogger(clock);
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'Shop', basicId: '@shop' },
    );
    typing = build();
  });

  const givenContact = async (lineUserId: LineUserId = LINE_USER): Promise<Contact> =>
    (await contacts.ensure({ id: ids.contactId(), lineUserId, now: clock.now() })).contact;

  it('asks LINE to show loading for LINE_LOADING_SECONDS to a following customer', async () => {
    const c = await givenContact();

    expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: true } });
    expect(gateway.loadingCalls).toEqual([
      { token: FAKE_LINE_ACCESS_TOKEN, userId: LINE_USER, seconds: LINE_LOADING_SECONDS },
    ]);
  });

  it('returns shown false without calling LINE for a second call in one RATE_LIMIT_TYPING window', async () => {
    const c = await givenContact();
    await typing({ contactId: c.id }, ctx);
    clock.advance(RATE_LIMIT_TYPING.windowMs - 1);

    expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: false } });
    expect(gateway.loadingCalls).toHaveLength(1);
  });

  it('limits per customer, not per IP', async () => {
    const a = await givenContact();
    const b = await givenContact('U-customer-2' as LineUserId); // brand: test id
    await typing({ contactId: a.id }, ctx);

    const otherIp = await typing(
      { contactId: a.id },
      { requestId: 'req-2', clientIp: '198.51.100.1' },
    );
    const otherContact = await typing({ contactId: b.id }, ctx);

    expect(otherIp).toEqual({ ok: true, value: { shown: false } });
    expect(otherContact).toEqual({ ok: true, value: { shown: true } });
    expect(gateway.loadingCalls).toHaveLength(2);
  });

  it('shows again once the fake clock passes into the next window', async () => {
    const c = await givenContact();
    await typing({ contactId: c.id }, ctx);
    clock.advance(RATE_LIMIT_TYPING.windowMs);

    expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: true } });
    expect(gateway.loadingCalls).toHaveLength(2);
  });

  it('returns shown false without calling LINE for an unfollowed customer', async () => {
    const c = await givenContact();
    await contacts.setFollowStatus(c.id, 'unfollowed', clock.now());

    expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: false } });
    expect(gateway.loadingCalls).toEqual([]);
  });

  it.each(['line.loading_failed', 'line.unauthorized', 'line.unavailable'] as const)(
    'returns shown false, not an error, and logs line.loading.failed when LINE returns %s',
    async (code) => {
      const c = await givenContact();
      gateway.failNext('showLoading', code);

      expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: false } });
      expect(logger.entries).toEqual([
        expect.objectContaining({
          level: 'warn',
          event: 'line.loading.failed',
          requestId: 'req-1',
          contactId: c.id,
          errorCode: code,
        }),
      ]);
      const dump = JSON.stringify(logger.entries);
      expect(dump).not.toContain(LINE_USER);
      expect(dump).not.toContain(FAKE_LINE_ACCESS_TOKEN);
    },
  );

  it('returns shown false when LINE is not configured', async () => {
    settings = new FakeSettingsRepository();
    typing = build();
    const c = await givenContact();

    expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: false } });
    expect(gateway.loadingCalls).toEqual([]);
  });

  it('returns shown false when the credentials cannot be decrypted', async () => {
    cipher = new FakeSecretCipher('another-key');
    typing = build();
    const c = await givenContact();

    expect(await typing({ contactId: c.id }, ctx)).toEqual({ ok: true, value: { shown: false } });
    expect(gateway.loadingCalls).toEqual([]);
  });

  it('returns contact.not_found for an unknown contact', async () => {
    expect(await typing({ contactId: ids.contactId() }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'contact.not_found' },
    });
    expect(gateway.loadingCalls).toEqual([]);
  });
});
