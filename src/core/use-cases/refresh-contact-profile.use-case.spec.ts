import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FakeClock,
  FakeContactRepository,
  FakeLogger,
  FakeMessagingGateway,
  FakeSecretCipher,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import type { ContactId, LineUserId } from '@/core/domain';
import { PRICE_TABLE, PROFILE_REFRESH_AFTER_MS } from '@/core/domain';
import { makeRefreshContactProfile } from './refresh-contact-profile.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx: RequestContext = { requestId: 'req-1', clientIp: null };
const USER = 'U-profile-0001' as LineUserId; // brand: test id
const CONTACT = '01a1ec98-e308-7000-8000-0000000000aa' as ContactId; // brand: test id
const HOUR_MS = 60 * 60 * 1000;

describe('RefreshContactProfile', () => {
  let clock: FakeClock;
  let gateway: FakeMessagingGateway;
  let contacts: FakeContactRepository;
  let logger: FakeLogger;
  let run: ReturnType<typeof makeRefreshContactProfile>;

  /** A contact whose profile was fetched (claimed) `ageMs` ago, named "ชื่อเดิม". */
  const contactFetchedAgo = async (ageMs: number | null): Promise<void> => {
    await contacts.ensure({ id: CONTACT, lineUserId: USER, now: clock.now() });
    await contacts.updateProfile(CONTACT, {
      displayName: 'ชื่อเดิม',
      pictureUrl: 'https://profile.line-scdn.net/old',
    });
    if (ageMs !== null) {
      const at = new Date(clock.now().getTime() - ageMs);
      await contacts.claimProfileRefresh(CONTACT, at, at);
    }
  };

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-19T03:00:00.000Z'));
    gateway = new FakeMessagingGateway();
    contacts = new FakeContactRepository();
    logger = new FakeLogger(clock);
    const cipher = new FakeSecretCipher();
    const settings = new FakeSettingsRepository();
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'Bot', basicId: '@bot' },
      { channelId: '1000000001', secretVerifiedAt: null },
    );
    gateway.setProfile(USER, { displayName: 'ชื่อใหม่', pictureUrl: null });
    run = makeRefreshContactProfile({ settings, cipher, gateway, contacts, clock, logger }, config);
  });

  it('makes no LINE call while the last attempt is fresh', async () => {
    await contactFetchedAgo(HOUR_MS);
    const profile = vi.spyOn(gateway, 'getProfile');

    expect(await run({ contactId: CONTACT }, ctx)).toEqual({
      ok: true,
      value: { outcome: 'skipped' },
    });
    expect(profile).not.toHaveBeenCalled();
    expect((await contacts.findById(CONTACT))?.displayName).toBe('ชื่อเดิม');
  });

  it('refreshes a stale profile once: new name, a missing picture cleared, updatedSeq moved', async () => {
    await contactFetchedAgo(PROFILE_REFRESH_AFTER_MS);
    const before = await contacts.findById(CONTACT);
    const profile = vi.spyOn(gateway, 'getProfile');

    expect((await run({ contactId: CONTACT }, ctx)).ok).toBe(true);

    expect(profile).toHaveBeenCalledTimes(1);
    const after = await contacts.findById(CONTACT);
    expect(after).toMatchObject({ displayName: 'ชื่อใหม่', pictureUrl: null });
    expect(BigInt(after?.updatedSeq ?? '0')).toBeGreaterThan(BigInt(before?.updatedSeq ?? '0'));
    expect(contacts.profileFetchedAtOf(CONTACT)).toEqual(clock.now());
  });

  it('refreshes a contact that was never fetched', async () => {
    await contactFetchedAgo(null);
    expect(await run({ contactId: CONTACT }, ctx)).toEqual({
      ok: true,
      value: { outcome: 'refreshed' },
    });
  });

  it('makes one LINE call for concurrent events of the same contact', async () => {
    await contactFetchedAgo(PROFILE_REFRESH_AFTER_MS + 1);
    const profile = vi.spyOn(gateway, 'getProfile');

    const outcomes = await Promise.all([
      run({ contactId: CONTACT }, ctx),
      run({ contactId: CONTACT }, ctx),
      run({ contactId: CONTACT }, ctx),
    ]);

    expect(profile).toHaveBeenCalledTimes(1);
    expect(outcomes.map((o) => (o.ok ? o.value.outcome : null)).sort()).toEqual([
      'refreshed',
      'skipped',
      'skipped',
    ]);
  });

  it('keeps the old name and picture when LINE fails (a blocked user answers 404) and does not retry at once', async () => {
    await contactFetchedAgo(PROFILE_REFRESH_AFTER_MS);
    gateway.failNext('getProfile', 'line.profile_unavailable');
    const profile = vi.spyOn(gateway, 'getProfile');

    expect(await run({ contactId: CONTACT }, ctx)).toEqual({
      ok: true,
      value: { outcome: 'failed' },
    });
    expect(await contacts.findById(CONTACT)).toMatchObject({
      displayName: 'ชื่อเดิม',
      pictureUrl: 'https://profile.line-scdn.net/old',
    });
    // The next event, a minute later, finds the attempt recorded and makes no call.
    clock.advance(60_000);
    expect(await run({ contactId: CONTACT }, ctx)).toEqual({
      ok: true,
      value: { outcome: 'skipped' },
    });
    expect(profile).toHaveBeenCalledTimes(1);
    // The log carries the code and the contact id only, never the name.
    expect(JSON.stringify(logger.entries)).not.toContain('ชื่อ');
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        event: 'line.profile.fetch_failed',
        errorCode: 'line.profile_unavailable',
      }),
    );
  });

  it('keeps the old values when getProfile throws', async () => {
    await contactFetchedAgo(PROFILE_REFRESH_AFTER_MS);
    vi.spyOn(gateway, 'getProfile').mockRejectedValueOnce(new TypeError('boom'));

    expect(await run({ contactId: CONTACT }, ctx)).toEqual({
      ok: true,
      value: { outcome: 'failed' },
    });
    expect((await contacts.findById(CONTACT))?.displayName).toBe('ชื่อเดิม');
  });
});
