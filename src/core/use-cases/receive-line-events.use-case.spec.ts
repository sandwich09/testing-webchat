import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Contact,
  LineEvent,
  LineMessageId,
  LineUserId,
  Message,
  PriceTable,
  WebhookEventId,
} from '@/core/domain';
import { REPLY_TOKEN_USABLE_MS, ok } from '@/core/domain';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FakeClock,
  FakeContactRepository,
  FakeContentHasher,
  FakeRateLimitRepository,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeSecretCipher,
  FakeSettingsRepository,
  FakeWebhookEventRepository,
} from '@/adapters/fakes';
import { makeReceiveLineEvents } from './receive-line-events.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.test',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 0,
  rateLimitScale: 1,
  priceTable: {} as PriceTable, // cast: not used by this use case
};
const ctx: RequestContext = { requestId: 'req-1', clientIp: null };

const USER = 'U-customer-0001' as LineUserId; // brand: test id
const OTHER_USER = 'U-customer-0002' as LineUserId; // brand: test id
const SECRET_TEXT = 'my phone is 0812345678';
const DISPLAY_NAME = 'Somchai Private';
const T0 = new Date('2026-11-18T03:00:00.000Z');

type RawEvent = Record<string, unknown>;

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${String(++seq)}`;

const base = (o: { id?: string; at?: Date; redelivery?: boolean; userId?: string }) => ({
  webhookEventId: o.id ?? nextId('wev'),
  timestamp: (o.at ?? T0).getTime(),
  source: { type: 'user', userId: o.userId ?? USER },
  deliveryContext: { isRedelivery: o.redelivery ?? false },
  mode: 'active',
});

const messageEvent = (
  message: Record<string, unknown>,
  o: { id?: string; at?: Date; redelivery?: boolean; userId?: string; replyToken?: string } = {},
): RawEvent => ({
  ...base(o),
  type: 'message',
  replyToken: o.replyToken ?? nextId('rt'),
  message: { id: nextId('lm'), ...message },
});

const textEvent = (
  text: string,
  o: Parameters<typeof messageEvent>[1] & { lineMessageId?: string } = {},
): RawEvent =>
  messageEvent({ type: 'text', text, ...(o.lineMessageId ? { id: o.lineMessageId } : {}) }, o);

const followEvent = (o: { id?: string; at?: Date; userId?: string } = {}): RawEvent => ({
  ...base(o),
  type: 'follow',
  replyToken: nextId('rt'),
});

const unfollowEvent = (o: { id?: string; at?: Date; userId?: string } = {}): RawEvent => ({
  ...base(o),
  type: 'unfollow',
});

const bodyOf = (...events: RawEvent[]): string => JSON.stringify({ destination: 'Ubot', events });

describe('ReceiveLineEvents', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let logger: FakeLogger;
  let cipher: FakeSecretCipher;
  let settings: FakeSettingsRepository;
  let gateway: FakeMessagingGateway;
  let webhookEvents: FakeWebhookEventRepository;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let rateLimits: FakeRateLimitRepository;
  let hasher: FakeContentHasher;
  let run: ReturnType<typeof makeReceiveLineEvents>;

  const configure = async (): Promise<void> => {
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'Shop', basicId: '@shop' },
      { channelId: '1000000001', secretVerifiedAt: null },
    );
  };

  /** Runs the use case with a correctly signed body. */
  const deliver = (body: string) => run({ rawBody: body, signature: gateway.sign(body) }, ctx);

  const allFollowUpsOf = async (body: string) => {
    const result = await deliver(body);
    if (!result.ok) throw new Error(`unexpected error ${result.error.code}`);
    return result.value.followUps;
  };

  /** The jobs without `refresh_profile`, which the "profile refresh" group checks on its own. */
  const followUpsOf = async (body: string) =>
    (await allFollowUpsOf(body)).filter((job) => job.kind !== 'refresh_profile');

  const allContacts = async (): Promise<Contact[]> =>
    (await contacts.list({ filter: 'all', search: null, before: null, limit: 100 })).contacts;

  const contactOf = async (userId: LineUserId = USER): Promise<Contact> => {
    const c = (await allContacts()).find((x) => x.lineUserId === userId);
    if (!c) throw new Error('contact missing');
    return c;
  };

  const messagesOf = async (userId: LineUserId = USER): Promise<Message[]> =>
    (await messages.listLatest((await contactOf(userId)).id, 100)).messages;

  /** An existing contact (profile already fetched) with the per-contact AI switched on or off. */
  const existingContact = async (aiEnabled: boolean): Promise<Contact> => {
    await followUpsOf(bodyOf(followEvent()));
    const c = await contactOf();
    await contacts.setAiEnabled(c.id, aiEnabled);
    return contactOf();
  };

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:05.000Z'));
    ids = new FakeIdGenerator(clock);
    logger = new FakeLogger(clock);
    cipher = new FakeSecretCipher();
    settings = new FakeSettingsRepository();
    gateway = new FakeMessagingGateway();
    webhookEvents = new FakeWebhookEventRepository();
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    rateLimits = new FakeRateLimitRepository();
    hasher = new FakeContentHasher();
    run = makeReceiveLineEvents(
      {
        settings,
        cipher,
        gateway,
        webhookEvents,
        contacts,
        messages,
        ids,
        clock,
        logger,
        rateLimits,
        hasher,
      },
      config,
    );
    gateway.setProfile(USER, { displayName: DISPLAY_NAME, pictureUrl: 'https://p.test/a.jpg' });
    await configure();
  });

  describe('before processing', () => {
    it('returns line.not_configured without parsing when no credentials are saved', async () => {
      settings = new FakeSettingsRepository();
      run = makeReceiveLineEvents(
        {
          settings,
          cipher,
          gateway,
          webhookEvents,
          contacts,
          messages,
          ids,
          clock,
          logger,
          rateLimits,
          hasher,
        },
        config,
      );
      const parse = vi.spyOn(gateway, 'parseEvents');
      const body = bodyOf(textEvent('hi'));

      const result = await deliver(body);

      expect(result).toMatchObject({ ok: false, error: { code: 'line.not_configured' } });
      expect(parse).not.toHaveBeenCalled();
      expect(logger.eventsOf('warn')).toContain('line.webhook.not_configured');
      expect((await settings.get()).lastWebhookAt).toBeNull();
    });

    it('returns line.credentials_unreadable when the stored credentials cannot be decrypted', async () => {
      await settings.saveLineCredentials(
        { channelSecretEnc: 'garbage', channelAccessTokenEnc: 'garbage' },
        { botName: 'Shop', basicId: '@shop' },
        { channelId: '1000000001', secretVerifiedAt: null },
      );

      const result = await deliver(bodyOf(textEvent('hi')));

      expect(result).toMatchObject({ ok: false, error: { code: 'line.credentials_unreadable' } });
      expect(logger.eventsOf()).toContain('line.webhook.not_configured');
      expect(await allContacts()).toHaveLength(0);
    });

    it('rejects a wrong signature with webhook.signature_invalid and writes nothing, not even lastWebhookAt', async () => {
      const body = bodyOf(textEvent(SECRET_TEXT));
      const parse = vi.spyOn(gateway, 'parseEvents');

      const result = await run(
        { rawBody: body, signature: gateway.sign(body, 'another-secret') },
        ctx,
      );

      expect(result).toMatchObject({ ok: false, error: { code: 'webhook.signature_invalid' } });
      expect(parse).not.toHaveBeenCalled();
      expect((await settings.get()).lastWebhookAt).toBeNull();
      expect(await allContacts()).toHaveLength(0);
      expect(await webhookEvents.has('wev-x' as WebhookEventId)).toBe(false); // brand: test id
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          event: 'line.webhook.signature_invalid',
          errorCode: 'webhook.signature_invalid',
        }),
      );
    });

    it('rejects a request without the signature header', async () => {
      const verify = vi.spyOn(gateway, 'verifySignature');

      const result = await run({ rawBody: bodyOf(textEvent('hi')), signature: null }, ctx);

      expect(result).toMatchObject({ ok: false, error: { code: 'webhook.signature_invalid' } });
      expect(verify).not.toHaveBeenCalled();
      expect((await settings.get()).lastWebhookAt).toBeNull();
      expect(logger.eventsOf('warn')).toContain('line.webhook.signature_invalid');
    });

    it('verifies the signature on the raw body before recording or parsing anything', async () => {
      const body = bodyOf(textEvent('hi'));
      const verify = vi.spyOn(gateway, 'verifySignature');
      const record = vi.spyOn(settings, 'recordWebhookReceived');
      const parse = vi.spyOn(gateway, 'parseEvents');

      await deliver(body);

      expect(verify).toHaveBeenCalledWith(body, gateway.sign(body), FAKE_LINE_CHANNEL_SECRET);
      const [verifyOrder] = verify.mock.invocationCallOrder;
      const [recordOrder] = record.mock.invocationCallOrder;
      const [parseOrder] = parse.mock.invocationCallOrder;
      expect(verifyOrder).toBeLessThan(recordOrder ?? 0);
      expect(recordOrder).toBeLessThan(parseOrder ?? 0);
    });

    it('answers ok with no follow-ups and records lastWebhookAt when the signed body is not JSON', async () => {
      const result = await deliver('not json');

      expect(result).toEqual(ok({ followUps: [] }));
      expect((await settings.get()).lastWebhookAt).toEqual(clock.now());
      expect(logger.eventsOf()).toContain('line.webhook.payload_invalid');
    });

    it('writes nothing but lastWebhookAt for an empty events list (the Verify button)', async () => {
      const result = await deliver(bodyOf());

      expect(result).toEqual(ok({ followUps: [] }));
      expect((await settings.get()).lastWebhookAt).toEqual(clock.now());
      expect(await allContacts()).toHaveLength(0);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.webhook.received', eventCount: 0 }),
      );
    });
  });

  describe('message events', () => {
    it('creates a new contact with AI off, fetches the profile, stores the message and adds no ai_reply', async () => {
      const profile = vi.spyOn(gateway, 'getProfile');

      const followUps = await followUpsOf(bodyOf(textEvent(SECRET_TEXT)));

      const c = await contactOf();
      expect(c).toMatchObject({
        aiEnabled: false,
        displayName: DISPLAY_NAME,
        pictureUrl: 'https://p.test/a.jpg',
        unreadCount: 1,
        lastMessagePreview: SECRET_TEXT,
        lastMessageBy: 'customer',
        lastMessageAt: T0,
      });
      expect(profile).toHaveBeenCalledTimes(1);
      expect(profile).toHaveBeenCalledWith(FAKE_LINE_ACCESS_TOKEN, USER);
      const [m] = await messagesOf();
      expect(m).toMatchObject({
        direction: 'inbound',
        author: 'customer',
        type: 'text',
        text: SECRET_TEXT,
        mediaStatus: null,
        createdAt: T0,
      });
      expect(followUps).toEqual([]);
    });

    it('stores the LINE id a text quotes, and null for a plain text', async () => {
      await deliver(
        bodyOf(
          messageEvent({
            type: 'text',
            text: 'ตอบอันนี้',
            quotedMessageId: 'L-quoted',
            quoteToken: 'q',
          }),
          textEvent('ธรรมดา'),
        ),
      );
      expect((await messagesOf()).map((m) => [m.text, m.quotedLineMessageId])).toEqual([
        ['ตอบอันนี้', 'L-quoted'],
        ['ธรรมดา', null],
      ]);
    });

    it('stores the contact without a name and still stores the message when the profile fetch fails', async () => {
      gateway.failNext('getProfile', 'line.profile_unavailable'); // what the adapter returns on timeout
      const profile = vi.spyOn(gateway, 'getProfile');

      const result = await deliver(bodyOf(textEvent('hello')));

      expect(result.ok).toBe(true);
      expect(profile).toHaveBeenCalledTimes(1); // no retry
      const c = await contactOf();
      expect(c.displayName).toBeNull();
      expect(c.pictureUrl).toBeNull();
      expect(await messagesOf()).toHaveLength(1);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          event: 'line.profile.fetch_failed',
          contactId: c.id,
          errorCode: 'line.profile_unavailable',
        }),
      );
    });

    it('keeps going when the profile call throws', async () => {
      vi.spyOn(gateway, 'getProfile').mockRejectedValueOnce(new TypeError('boom'));

      await followUpsOf(bodyOf(textEvent('hello')));

      expect((await contactOf()).displayName).toBeNull();
      expect(await messagesOf()).toHaveLength(1);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.profile.fetch_failed', errorName: 'TypeError' }),
      );
    });

    it('adds an ai_reply job for this message from an existing contact with AI on, without a second profile call', async () => {
      const c = await existingContact(true);
      const profile = vi.spyOn(gateway, 'getProfile');

      const followUps = await followUpsOf(bodyOf(textEvent('price?')));

      const latest = (await messagesOf()).at(-1);
      expect(latest?.text).toBe('price?');
      expect(followUps).toEqual([
        { kind: 'ai_reply', contactId: c.id, triggerMessageId: latest?.id },
      ]);
      expect(profile).not.toHaveBeenCalled();
    });

    it('skips an event whose webhookEventId was already processed', async () => {
      await existingContact(true);
      const event = textEvent('once', { id: 'wev-dup' });
      await followUpsOf(bodyOf(event));
      const before = (await messagesOf()).length;

      const followUps = await followUpsOf(bodyOf(event));

      expect(followUps).toEqual([]);
      expect(await messagesOf()).toHaveLength(before);
      expect((await contactOf()).unreadCount).toBe(1);
      expect(logger.eventsOf()).toContain('line.webhook.event_duplicate');
    });

    it('stores no second message for a new webhookEventId with a known lineMessageId', async () => {
      await existingContact(true);
      await followUpsOf(bodyOf(textEvent('once', { lineMessageId: 'lm-same' })));

      const followUps = await followUpsOf(
        bodyOf(textEvent('once', { lineMessageId: 'lm-same', redelivery: true })),
      );

      expect(followUps).toEqual([]);
      expect((await messagesOf()).filter((m) => m.type === 'text')).toHaveLength(1);
      expect((await contactOf()).unreadCount).toBe(1);
    });

    it('stores one message when it crashes after the message and before the WebhookEvent row, then LINE redelivers', async () => {
      const body = bodyOf(textEvent('hello', { id: 'wev-crash' }));
      vi.spyOn(webhookEvents, 'insertIfAbsent').mockRejectedValueOnce(new Error('db down'));

      const first = await deliver(body);
      expect(first.ok).toBe(true);
      expect(logger.eventsOf('error')).toContain('line.webhook.event_failed');
      expect(await webhookEvents.has('wev-crash' as WebhookEventId)).toBe(false); // brand: test id

      const second = await followUpsOf(body);

      expect(second).toEqual([]);
      expect(await messagesOf()).toHaveLength(1);
      expect((await contactOf()).unreadCount).toBe(1);
      expect(await webhookEvents.has('wev-crash' as WebhookEventId)).toBe(true); // brand: test id
    });

    it('stores exactly one message when two identical deliveries race', async () => {
      const body = bodyOf(textEvent('hello', { id: 'wev-race', lineMessageId: 'lm-race' }));

      const results = await Promise.all([deliver(body), deliver(body)]);

      expect(results.every((r) => r.ok)).toBe(true);
      expect(await allContacts()).toHaveLength(1);
      expect(await messagesOf()).toHaveLength(1);
      expect((await contactOf()).unreadCount).toBe(1);
    });

    it('keeps no reply token from a redelivered event', async () => {
      const body = bodyOf(textEvent('late'));
      // The LINE adapter already drops it; the use case must not rely on that.
      const event: LineEvent = {
        kind: 'message',
        webhookEventId: 'wev-redelivered' as WebhookEventId, // brand: test id
        timestamp: T0,
        isRedelivery: true,
        userId: USER,
        replyToken: 'rt-redelivered',
        message: {
          type: 'text',
          lineMessageId: 'lm-redelivered' as LineMessageId, // brand: test id
          text: 'late',
          quotedLineMessageId: null,
        },
      };
      vi.spyOn(gateway, 'parseEvents').mockReturnValue(ok([event]));

      await followUpsOf(body);

      const c = await contactOf();
      expect(c.replyToken).toBeNull();
      expect(c.replyTokenExpiresAt).toBeNull();
      expect(c.unreadCount).toBe(1);
    });

    it('keeps the reply token that expires later and ignores an older one', async () => {
      const t1 = new Date(T0.getTime() + 10_000);
      await followUpsOf(bodyOf(textEvent('first', { at: t1, replyToken: 'rt-new' })));
      expect(await contactOf()).toMatchObject({
        replyToken: 'rt-new',
        replyTokenExpiresAt: new Date(t1.getTime() + REPLY_TOKEN_USABLE_MS),
      });

      await followUpsOf(bodyOf(textEvent('older', { at: T0, replyToken: 'rt-old' })));
      expect((await contactOf()).replyToken).toBe('rt-new');

      const t2 = new Date(t1.getTime() + 1);
      await followUpsOf(bodyOf(textEvent('newest', { at: t2, replyToken: 'rt-newest' })));
      expect(await contactOf()).toMatchObject({
        replyToken: 'rt-newest',
        replyTokenExpiresAt: new Date(t2.getTime() + REPLY_TOKEN_USABLE_MS),
      });
    });

    it('stores an image hosted on LINE as pending and adds a store_media job', async () => {
      const followUps = await followUpsOf(
        bodyOf(messageEvent({ type: 'image', contentProvider: { type: 'line' } })),
      );

      const [m] = await messagesOf();
      expect(m).toMatchObject({ type: 'image', mediaStatus: 'pending', mediaUrl: null });
      expect(followUps).toEqual([{ kind: 'store_media', messageId: m?.id }]);
      expect((await contactOf()).lastMessageType).toBe('image');
    });

    it('stores an image from an external URL as failed and adds no store_media job', async () => {
      const followUps = await followUpsOf(
        bodyOf(
          messageEvent({
            type: 'image',
            contentProvider: { type: 'external', originalContentUrl: 'https://evil.test/x.jpg' },
          }),
        ),
      );

      const [m] = await messagesOf();
      expect(m).toMatchObject({
        type: 'image',
        mediaStatus: 'failed',
        mediaFailure: 'external_source',
        mediaUrl: null,
      });
      expect(followUps).toEqual([]);
    });

    it('adds store_media then ai_reply for a video from a contact with AI on', async () => {
      const c = await existingContact(true);

      const followUps = await followUpsOf(
        bodyOf(messageEvent({ type: 'video', contentProvider: { type: 'line' } })),
      );

      const m = (await messagesOf()).at(-1);
      expect(m).toMatchObject({ type: 'video', mediaStatus: 'pending' });
      expect(followUps).toEqual([
        { kind: 'store_media', messageId: m?.id },
        { kind: 'ai_reply', contactId: c.id, triggerMessageId: m?.id },
      ]);
    });

    it('returns store_media again when a redelivery finds the image still pending, with no second unread or ai_reply', async () => {
      await existingContact(true);
      const body = bodyOf(
        messageEvent({ type: 'image', contentProvider: { type: 'line' } }, { id: 'wev-img' }),
      );
      vi.spyOn(webhookEvents, 'insertIfAbsent').mockRejectedValueOnce(new Error('db down'));
      const first = await followUpsOf(body);
      const m = (await messagesOf()).at(-1);
      expect(first.map((j) => j.kind)).toEqual(['store_media', 'ai_reply']);

      const second = await followUpsOf(body);

      expect(second).toEqual([{ kind: 'store_media', messageId: m?.id }]);
      expect((await messagesOf()).filter((x) => x.type === 'image')).toHaveLength(1);
      expect((await contactOf()).unreadCount).toBe(1);
    });

    it('returns store_media even when the event fails right after the message is stored', async () => {
      vi.spyOn(contacts, 'recordInbound').mockRejectedValueOnce(new Error('db down'));
      const body = bodyOf(messageEvent({ type: 'video', contentProvider: { type: 'line' } }));

      const first = await followUpsOf(body);
      const [m] = await messagesOf();
      expect(first).toEqual([{ kind: 'store_media', messageId: m?.id }]);
      expect(logger.eventsOf('error')).toContain('line.webhook.event_failed');

      // LINE redelivers: the job comes again and the message is not stored twice.
      expect(await followUpsOf(body)).toEqual([{ kind: 'store_media', messageId: m?.id }]);
      expect(await messagesOf()).toHaveLength(1);
    });

    it('adds no store_media for a known lineMessageId whose media is no longer pending', async () => {
      const event = messageEvent({
        type: 'image',
        id: 'lm-img',
        contentProvider: { type: 'line' },
      });
      await followUpsOf(bodyOf(event));
      const [m] = await messagesOf();
      if (!m) throw new Error('expected a message');
      await messages.setMediaReady(m.id, 'https://files.test/o.jpg', 'https://files.test/o.jpg');

      const again = messageEvent({
        type: 'image',
        id: 'lm-img',
        contentProvider: { type: 'line' },
      });
      expect(await followUpsOf(bodyOf(again))).toEqual([]);
      expect((await contactOf()).unreadCount).toBe(1);
    });

    it('leaves the non-text handoff to GenerateAiReply: no handoff in the request, job only when the contact AI is on', async () => {
      // Kill switch off and contact AI on: GenerateAiReply skips without a handoff.
      const c = await existingContact(true);
      const sticker = await followUpsOf(
        bodyOf(messageEvent({ type: 'sticker', packageId: '1', stickerId: '2' })),
      );
      expect(sticker).toEqual([
        { kind: 'ai_reply', contactId: c.id, triggerMessageId: (await messagesOf()).at(-1)?.id },
      ]);

      // Contact AI off: no job, so no handoff can follow.
      await contacts.setAiEnabled(c.id, false);
      const image = await followUpsOf(
        bodyOf(messageEvent({ type: 'image', contentProvider: { type: 'line' } })),
      );
      expect(image.map((j) => j.kind)).toEqual(['store_media']);

      const after = await contactOf();
      expect(after.needsAdmin).toBe(false);
      expect((await messagesOf()).some((m) => m.eventCode?.startsWith('handoff.'))).toBe(false);
    });

    it('stores the packageId and stickerId of a sticker', async () => {
      await followUpsOf(
        bodyOf(messageEvent({ type: 'sticker', packageId: '446', stickerId: '1988' })),
      );

      const [m] = await messagesOf();
      expect(m).toMatchObject({
        type: 'sticker',
        stickerPackageId: '446',
        stickerId: '1988',
        text: null,
        mediaStatus: null,
      });
    });

    it('stores a voice message as audio pending with its duration and schedules store_media', async () => {
      const followUps = await followUpsOf(
        bodyOf(messageEvent({ type: 'audio', duration: 4200, contentProvider: { type: 'line' } })),
      );
      const [m] = await messagesOf();
      expect(m).toMatchObject({
        type: 'audio',
        mediaStatus: 'pending',
        mediaDurationMs: 4200,
        otherKind: null,
      });
      expect(followUps).toEqual(
        expect.arrayContaining([{ kind: 'store_media', messageId: m?.id }]),
      );
    });

    it('stores externally hosted audio as failed and never fetches it', async () => {
      const followUps = await followUpsOf(
        bodyOf(
          messageEvent({
            type: 'audio',
            duration: 1000,
            contentProvider: { type: 'external', originalContentUrl: 'https://evil.example/a' },
          }),
        ),
      );
      const [m] = await messagesOf();
      expect(m).toMatchObject({ type: 'audio', mediaStatus: 'failed' });
      expect(followUps.filter((f) => f.kind === 'store_media')).toEqual([]);
    });

    it.each(['file', 'location'] as const)(
      'stores %s as type other with that otherKind',
      async (kind) => {
        const followUps = await followUpsOf(bodyOf(messageEvent({ type: kind })));

        const [m] = await messagesOf();
        expect(m).toMatchObject({ type: 'other', otherKind: kind, text: null, mediaStatus: null });
        expect(followUps).toEqual([]);
      },
    );

    it('stores two events of one customer in one payload as two messages in payload order', async () => {
      await followUpsOf(
        bodyOf(
          textEvent('first', { at: new Date(T0.getTime() + 5) }),
          textEvent('second', { at: T0 }),
        ),
      );

      const list = await messagesOf();
      expect(list.map((m) => m.text)).toEqual(['first', 'second']);
      expect((list[0]?.seq ?? 0n) < (list[1]?.seq ?? 0n)).toBe(true);
      expect((await contactOf()).unreadCount).toBe(2);
    });
  });

  describe('follow and unfollow', () => {
    it('marks a first follow as following at the event time with a contact.followed line', async () => {
      await followUpsOf(bodyOf(followEvent({ at: T0 })));

      const c = await contactOf();
      expect(c).toMatchObject({
        followStatus: 'following',
        followedAt: T0,
        displayName: DISPLAY_NAME,
      });
      const lines = await messagesOf();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        type: 'event',
        author: 'system',
        direction: 'internal',
        eventCode: 'contact.followed',
        createdAt: T0,
      });
      expect(c.unreadCount).toBe(0);
    });

    it('adds no event line for a follow while already following', async () => {
      await followUpsOf(bodyOf(followEvent()));

      await followUpsOf(bodyOf(followEvent({ at: new Date(T0.getTime() + 1000) })));

      expect(await messagesOf()).toHaveLength(1);
      expect((await contactOf()).followedAt).toEqual(T0);
    });

    it('marks an unfollow as unfollowed, clears the reply token and adds a contact.unfollowed line', async () => {
      await followUpsOf(bodyOf(textEvent('hi', { replyToken: 'rt-live' })));
      expect((await contactOf()).replyToken).toBe('rt-live');

      const followUps = await followUpsOf(
        bodyOf(unfollowEvent({ at: new Date(T0.getTime() + 1) })),
      );

      const c = await contactOf();
      expect(c).toMatchObject({
        followStatus: 'unfollowed',
        replyToken: null,
        replyTokenExpiresAt: null,
      });
      expect((await messagesOf()).at(-1)).toMatchObject({ eventCode: 'contact.unfollowed' });
      expect(followUps).toEqual([]);
    });

    it('follows again after an unfollow with a new contact.followed line', async () => {
      await followUpsOf(bodyOf(followEvent()));
      await followUpsOf(bodyOf(unfollowEvent()));
      const later = new Date(T0.getTime() + 60_000);

      await followUpsOf(bodyOf(followEvent({ at: later })));

      expect(await contactOf()).toMatchObject({ followStatus: 'following', followedAt: later });
      expect((await messagesOf()).map((m) => m.eventCode)).toEqual([
        'contact.followed',
        'contact.unfollowed',
        'contact.followed',
      ]);
    });

    it('creates an unseen contact on unfollow without fetching its profile', async () => {
      const profile = vi.spyOn(gateway, 'getProfile');

      await followUpsOf(bodyOf(unfollowEvent({ userId: OTHER_USER })));

      expect(await contactOf(OTHER_USER)).toMatchObject({ followStatus: 'unfollowed' });
      expect(profile).not.toHaveBeenCalled();
    });

    it('ignores an unfollow older than the latest follow, also within one batch', async () => {
      const later = new Date(T0.getTime() + 60_000);
      await followUpsOf(bodyOf(followEvent({ at: T0 })));
      await followUpsOf(bodyOf(unfollowEvent({ at: T0 })));

      await followUpsOf(
        bodyOf(followEvent({ at: later }), unfollowEvent({ at: new Date(T0.getTime() + 1000) })),
      );

      expect(await contactOf()).toMatchObject({ followStatus: 'following', followedAt: later });
      expect((await messagesOf()).map((m) => m.eventCode)).toEqual([
        'contact.followed',
        'contact.unfollowed',
        'contact.followed',
      ]);
    });

    it.each([
      ['a text', () => textEvent('ยังอยู่ไหม')],
      [
        'a tap',
        () => ({
          ...base({ at: new Date(T0.getTime() + 60_000) }),
          type: 'postback',
          replyToken: nextId('rt'),
          postback: { data: 'tw1:how_to' },
        }),
      ],
    ] as const)(
      'sets a contact stored as unfollowed back to following on %s, with a contact.followed line',
      async (_label, activity) => {
        await followUpsOf(bodyOf(followEvent({ at: T0 })));
        await followUpsOf(bodyOf(unfollowEvent({ at: T0 })));
        const at = new Date(T0.getTime() + 60_000);
        const event = activity();
        if (event['type'] === 'message') event['timestamp'] = at.getTime();

        await followUpsOf(bodyOf(event));

        expect(await contactOf()).toMatchObject({ followStatus: 'following', followedAt: at });
        const codes = (await messagesOf())
          .filter((m) => m.type === 'event')
          .map((m) => m.eventCode);
        expect(codes).toEqual(['contact.followed', 'contact.unfollowed', 'contact.followed']);
      },
    );

    it('keeps the unfollow when a customer message older than it arrives late', async () => {
      await followUpsOf(bodyOf(followEvent({ at: T0 })));
      await followUpsOf(bodyOf(unfollowEvent({ at: new Date(T0.getTime() + 60_000) })));

      await followUpsOf(bodyOf(textEvent('เก่า', { at: new Date(T0.getTime() + 30_000) })));

      expect((await contactOf()).followStatus).toBe('unfollowed');
      expect((await messagesOf()).filter((m) => m.eventCode === 'contact.followed')).toHaveLength(
        1,
      );
    });

    it('does nothing more for a second unfollow', async () => {
      await followUpsOf(bodyOf(unfollowEvent()));

      await followUpsOf(bodyOf(unfollowEvent()));

      expect(await messagesOf()).toHaveLength(1);
    });
  });

  describe('profile refresh', () => {
    it('fetches the profile of a first-seen contact in the request and records the attempt', async () => {
      gateway.setProfile(USER, { displayName: 'คุณหนึ่ง', pictureUrl: null });
      const jobs = await allFollowUpsOf(bodyOf(textEvent('hi')));
      const c = await contactOf();
      expect(c.displayName).toBe('คุณหนึ่ง');
      expect(contacts.profileFetchedAtOf(c.id)).toEqual(clock.now());
      expect(jobs.filter((j) => j.kind === 'refresh_profile')).toEqual([]);
    });

    it('records the attempt of a failed first fetch too, so the next try waits a day', async () => {
      gateway.failNext('getProfile', 'line.profile_unavailable');
      await allFollowUpsOf(bodyOf(textEvent('hi')));
      const c = await contactOf();
      expect(c.displayName).toBeNull();
      expect(contacts.profileFetchedAtOf(c.id)).toEqual(clock.now());
    });

    it('hands an existing contact one refresh job per request, without a LINE call in the request', async () => {
      await followUpsOf(bodyOf(textEvent('first')));
      const c = await contactOf();
      const profile = vi.spyOn(gateway, 'getProfile');
      const jobs = await allFollowUpsOf(
        bodyOf(textEvent('second'), textEvent('third'), followEvent()),
      );
      expect(jobs.filter((j) => j.kind === 'refresh_profile')).toEqual([
        { kind: 'refresh_profile', contactId: c.id },
      ]);
      expect(profile).not.toHaveBeenCalled();
    });

    it('gives an unfollow no refresh job', async () => {
      await followUpsOf(bodyOf(textEvent('first')));
      expect(
        (await allFollowUpsOf(bodyOf(unfollowEvent()))).filter((j) => j.kind === 'refresh_profile'),
      ).toEqual([]);
    });
  });

  describe('event isolation', () => {
    it('logs an unknown event type, skips it and still processes the other events', async () => {
      const unknown = { ...base({}), type: 'beacon', beacon: { hwid: 'x' } };

      await followUpsOf(bodyOf(unknown, textEvent('after')));

      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'line.webhook.event_unsupported',
          lineEventType: 'beacon',
        }),
      );
      expect((await messagesOf()).map((m) => m.text)).toEqual(['after']);
      expect(await webhookEvents.has(unknown.webhookEventId as WebhookEventId)).toBe(true); // brand: test id
    });

    it('still stores the second event and answers ok when the first one throws', async () => {
      vi.spyOn(contacts, 'ensure').mockRejectedValueOnce(new RangeError('db hiccup'));
      const failing = textEvent('lost', { userId: OTHER_USER });

      const result = await deliver(bodyOf(failing, textEvent('kept')));

      expect(result.ok).toBe(true);
      expect((await messagesOf()).map((m) => m.text)).toEqual(['kept']);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'error',
          event: 'line.webhook.event_failed',
          lineEventType: 'message',
          errorName: 'RangeError',
        }),
      );
      // Not marked as processed, so LINE's redelivery is handled.
      expect(await webhookEvents.has(failing.webhookEventId as WebhookEventId)).toBe(false); // brand: test id
    });

    it('logs a thrown value that is not an Error by a generic name', async () => {
      vi.spyOn(contacts, 'ensure').mockRejectedValueOnce('plain string');

      const result = await deliver(bodyOf(textEvent('x')));

      expect(result.ok).toBe(true);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.webhook.event_failed', errorName: 'UnknownError' }),
      );
    });
  });

  describe('webhook redelivery', () => {
    /** The database is down: every repository call and the ping throw. */
    const databaseDown = () => {
      const down = () => Promise.reject(new Error('connect ECONNREFUSED'));
      const spies = [
        vi.spyOn(webhookEvents, 'has').mockImplementation(down),
        vi.spyOn(contacts, 'ensure').mockImplementation(down),
        vi.spyOn(messages, 'insertInboundIfAbsent').mockImplementation(down),
      ];
      settings.pingError = new Error('connect ECONNREFUSED');
      return () => {
        for (const spy of spies) spy.mockRestore();
        settings.pingError = null;
      };
    };

    it('answers db.unavailable when nothing of the batch could be stored, so LINE redelivers', async () => {
      const restore = databaseDown();

      const result = await deliver(bodyOf(textEvent('one'), followEvent({ userId: OTHER_USER })));

      expect(result).toMatchObject({ ok: false, error: { code: 'db.unavailable' } });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'error',
          event: 'line.webhook.batch_unstored',
          eventCount: 2,
          errorCode: 'db.unavailable',
        }),
      );
      restore();
    });

    it('stores a batch redelivered after the 5xx exactly once, however often it comes', async () => {
      const event = textEvent('สั่งกาแฟ', { lineMessageId: 'lm-redelivered' });
      const restore = databaseDown();
      expect((await deliver(bodyOf(event))).ok).toBe(false);
      restore();

      // LINE redelivers the same webhookEventId, marked as a redelivery.
      const again = { ...event, deliveryContext: { isRedelivery: true } };
      const first = await deliver(bodyOf(again));
      const second = await deliver(bodyOf(again));

      expect(first.ok && second.ok).toBe(true);
      const stored = await messagesOf();
      expect(stored.map((m) => m.text)).toEqual(['สั่งกาแฟ']);
      expect((await contactOf()).unreadCount).toBe(1);
      // A redelivered event keeps no reply token (it cannot be used).
      expect((await contactOf()).replyToken).toBeNull();
      expect(logger.eventsOf()).toContain('line.webhook.event_duplicate');
    });

    it('answers ok when at least one event was stored and another failed', async () => {
      const ensure = contacts.ensure.bind(contacts);
      vi.spyOn(contacts, 'ensure')
        .mockImplementationOnce(ensure)
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      settings.pingError = new Error('connect ECONNREFUSED');

      const result = await deliver(
        bodyOf(textEvent('kept'), textEvent('lost', { userId: OTHER_USER })),
      );

      expect(result.ok).toBe(true);
      expect((await messagesOf()).map((m) => m.text)).toEqual(['kept']);
      expect(logger.eventsOf()).not.toContain('line.webhook.batch_unstored');
    });

    it('answers ok when every event failed for its own reason while the database answers', async () => {
      vi.spyOn(contacts, 'ensure').mockRejectedValue(new TypeError('bad row'));

      const result = await deliver(bodyOf(textEvent('a'), textEvent('b', { userId: OTHER_USER })));

      expect(result.ok).toBe(true);
      expect(logger.eventsOf()).not.toContain('line.webhook.batch_unstored');
    });

    it('answers ok for a batch of duplicates and unsupported events only', async () => {
      const event = textEvent('once');
      await followUpsOf(bodyOf(event));
      settings.pingError = new Error('down');

      const result = await deliver(bodyOf(event, { ...base({}), type: 'beacon' }));

      expect(result.ok).toBe(true);
    });
  });

  it('never logs message text, display names, LINE user ids or reply tokens', async () => {
    gateway.failNext('getProfile', 'line.unavailable');
    await deliver(bodyOf(textEvent(SECRET_TEXT, { replyToken: 'rt-secret-token' })));
    gateway.setProfile(OTHER_USER, { displayName: DISPLAY_NAME, pictureUrl: null });
    await deliver(bodyOf(followEvent({ userId: OTHER_USER }), { ...base({}), type: 'beacon' }));
    await run({ rawBody: bodyOf(textEvent(SECRET_TEXT)), signature: 'bad' }, ctx);

    const logged = JSON.stringify(logger.entries);
    expect(logger.entries.length).toBeGreaterThan(0);
    for (const secret of [SECRET_TEXT, DISPLAY_NAME, USER, OTHER_USER, 'rt-secret-token']) {
      expect(logged).not.toContain(secret);
    }
  });

  describe('rich menu and welcome card', () => {
    const postbackEvent = (
      data: unknown,
      o: { id?: string; at?: Date; userId?: string; replyToken?: string | null } = {},
    ): RawEvent => ({
      ...base(o),
      type: 'postback',
      ...(o.replyToken === null ? {} : { replyToken: o.replyToken ?? nextId('rt') }),
      postback: data === undefined ? {} : { data },
    });

    it('keeps a tap as the button title with its event code, and hands the action on', async () => {
      const followUps = await followUpsOf(
        bodyOf(postbackEvent('tw1:ai_on', { replyToken: 'rt-tap' })),
      );
      const contact = await contactOf();
      const [tap] = await messagesOf();
      expect(tap).toMatchObject({
        direction: 'inbound',
        author: 'customer',
        type: 'text',
        text: 'คุยกับ AI',
        eventCode: 'customer.tapped_ai_on',
        lineMessageId: null,
      });
      expect(followUps).toEqual([
        { kind: 'rich_menu_action', contactId: contact.id, action: 'ai_on', tapMessageId: tap?.id },
      ]);
      expect(contact).toMatchObject({ replyToken: 'rt-tap', unreadCount: 1 });
      expect(contact.displayName).toBe(DISPLAY_NAME);
      expect(logger.entries.find((e) => e.event === 'line.postback.received')).toMatchObject({
        reason: 'ai_on',
      });
    });

    it.each([
      ['tw1:admin', 'admin', 'customer.tapped_admin', 'คุยกับแอดมิน'],
      ['tw1:how_to', 'how_to', 'customer.tapped_how_to', 'วิธีทดสอบ'],
    ])('maps %s to %s', async (data, action, eventCode, text) => {
      const followUps = await followUpsOf(bodyOf(postbackEvent(data)));
      expect(followUps).toMatchObject([{ kind: 'rich_menu_action', action }]);
      expect((await messagesOf())[0]).toMatchObject({ eventCode, text });
    });

    it('ignores data it did not make, stores nothing and does not log the data', async () => {
      const followUps = await followUpsOf(
        bodyOf(postbackEvent('tw9:secret-data'), postbackEvent('tw1:nope')),
      );
      expect(followUps).toEqual([]);
      expect(await allContacts()).toHaveLength(0);
      expect(logger.eventsOf()).toContain('line.postback.ignored');
      expect(JSON.stringify(logger.entries)).not.toContain('secret-data');
    });

    it('stores a tap once and hands on one action when a redelivery races the first delivery', async () => {
      const body = bodyOf(postbackEvent('tw1:how_to', { id: 'wev-tap-race' }));

      const results = await Promise.all([followUpsOf(body), followUpsOf(body)]);

      const taps = (await messagesOf()).filter((m) => m.eventCode === 'customer.tapped_how_to');
      expect(taps).toHaveLength(1);
      expect(results.flat().filter((j) => j.kind === 'rich_menu_action')).toHaveLength(1);
      expect((await contactOf()).unreadCount).toBe(1);
    });

    it('treats a postback without data as unsupported', async () => {
      expect(await followUpsOf(bodyOf(postbackEvent(undefined)))).toEqual([]);
      expect(logger.eventsOf()).toContain('line.webhook.event_unsupported');
    });

    it('stores a redelivered tap once, by its webhook event id', async () => {
      const event = postbackEvent('tw1:how_to', { id: 'wev-tap' });
      await followUpsOf(bodyOf(event));
      const again = await followUpsOf(bodyOf(event));
      expect(again).toEqual([]);
      expect(await messagesOf()).toHaveLength(1);
    });

    it('drops taps over the per-contact limit: no row and no job', async () => {
      const taps = Array.from({ length: 4 }, () => postbackEvent('tw1:how_to'));
      const followUps = await followUpsOf(bodyOf(...taps));
      expect(followUps).toHaveLength(3);
      expect(await messagesOf()).toHaveLength(3);
      expect(logger.eventsOf()).toContain('line.postback.rate_limited');
    });

    it('hands a follow with a reply token to the welcome job, also on a re-follow', async () => {
      const event = followEvent();
      const first = await followUpsOf(bodyOf(event));
      const contact = await contactOf();
      expect(first).toEqual([
        { kind: 'welcome', contactId: contact.id, replyToken: event['replyToken'] },
      ]);
      await followUpsOf(bodyOf(unfollowEvent()));
      const again = await followUpsOf(bodyOf(followEvent()));
      expect(again).toMatchObject([{ kind: 'welcome', contactId: contact.id }]);
    });

    it('gives a redelivered follow no welcome job', async () => {
      const event = followEvent({ id: 'wev-follow' });
      await followUpsOf(bodyOf(event));
      expect(await followUpsOf(bodyOf(event))).toEqual([]);
      const redelivered = { ...followEvent(), deliveryContext: { isRedelivery: true } };
      expect(await followUpsOf(bodyOf(redelivered))).toEqual([]);
    });
  });
});
