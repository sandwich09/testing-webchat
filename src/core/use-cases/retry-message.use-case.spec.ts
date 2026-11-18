import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Contact,
  ContactId,
  LineMessageId,
  LineUserId,
  Message,
  MessageAuthor,
} from '@/core/domain';
import { PRICE_TABLE, RATE_LIMIT_SEND_MESSAGE, REPLY_TOKEN_USABLE_MS } from '@/core/domain';
import type { NewMessage } from '@/core/ports';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FakeClock,
  FakeContactRepository,
  FakeContentHasher,
  FakeFileStorage,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeRateLimitRepository,
  FakeSecretCipher,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { makeRetryMessage } from './retry-message.use-case';
import { makeSendAdminMessage } from './send-admin-message.use-case';
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

describe('RetryMessage', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let settings: FakeSettingsRepository;
  let cipher: FakeSecretCipher;
  let gateway: FakeMessagingGateway;
  let rateLimits: FakeRateLimitRepository;
  let hasher: FakeContentHasher;
  let logger: FakeLogger;

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:10.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    settings = new FakeSettingsRepository();
    cipher = new FakeSecretCipher();
    gateway = new FakeMessagingGateway();
    rateLimits = new FakeRateLimitRepository();
    hasher = new FakeContentHasher();
    logger = new FakeLogger(clock);
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'Shop', basicId: '@shop' },
    );
  });

  const retryWith = (repo: FakeMessageRepository = messages) =>
    makeRetryMessage(
      {
        messages: repo,
        contacts,
        settings,
        cipher,
        gateway,
        rateLimits,
        hasher,
        clock,
        logger,
      },
      config,
    );

  const givenContact = async (replyToken?: string): Promise<Contact> => {
    const { contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: LINE_USER,
      now: clock.now(),
    });
    if (replyToken !== undefined) {
      await contacts.recordInbound(contact.id, {
        at: clock.now(),
        preview: { type: 'text', text: 'hi' },
        replyToken,
        replyTokenExpiresAt: new Date(clock.now().getTime() + REPLY_TOKEN_USABLE_MS),
      });
    }
    return (await contacts.findById(contact.id)) ?? contact;
  };

  const row = (contactId: ContactId, over: Partial<NewMessage> = {}): NewMessage => {
    const id = ids.messageId();
    return {
      id,
      contactId,
      direction: 'outbound',
      author: 'admin',
      type: 'text',
      text: 'สวัสดีค่ะ',
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: null,
      lineMessageId: null,
      deliveryStatus: 'pending',
      deliveryError: null,
      retryKey: id,
      createdAt: clock.now(),
      sentAt: null,
      ...over,
    };
  };

  /** An outbound message in the failed state, as left by an earlier attempt. */
  const givenFailed = async (
    contactId: ContactId,
    author: MessageAuthor = 'admin',
  ): Promise<Message> => {
    const { message } = await messages.insertOutboundIfAbsent(row(contactId, { author }));
    return messages.markFailed(message.id, 'line.unavailable');
  };

  it('pushes a failed message with its stored retry key and marks it sent', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);

    const result = await retryWith()({ contactId: c.id, messageId: m.id }, ctx);

    expect(result).toMatchObject({
      ok: true,
      value: { id: m.id, deliveryStatus: 'sent', deliveryError: null },
    });
    expect(gateway.pushes).toEqual([
      {
        token: FAKE_LINE_ACCESS_TOKEN,
        to: LINE_USER,
        parts: [{ type: 'text', text: 'สวัสดีค่ะ' }],
        retryKey: m.retryKey,
      },
    ]);
  });

  it('is sent and LINE gets the message once when it already accepted the retry key', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);
    // The first attempt reached LINE but its answer was lost.
    await gateway.push(FAKE_LINE_ACCESS_TOKEN, LINE_USER, [{ type: 'text', text: 'x' }], m.id);

    const result = await retryWith()({ contactId: c.id, messageId: m.id }, ctx);

    expect(result).toMatchObject({ ok: true, value: { deliveryStatus: 'sent' } });
    expect(gateway.pushes).toHaveLength(1);
  });

  it('still pushes when the contact holds a usable reply token', async () => {
    const c = await givenContact('rt-1');
    const m = await givenFailed(c.id);

    await retryWith()({ contactId: c.id, messageId: m.id }, ctx);

    expect(gateway.replies).toEqual([]);
    expect(gateway.pushes).toHaveLength(1);
    expect((await contacts.findById(c.id))?.replyToken).toBe('rt-1');
  });

  it.each(['sent', 'pending'] as const)(
    'returns message.not_retryable for a %s message',
    async (status) => {
      const c = await givenContact();
      const { message } = await messages.insertOutboundIfAbsent(row(c.id));
      if (status === 'sent') await messages.markSent(message.id, clock.now());

      const result = await retryWith()({ contactId: c.id, messageId: message.id }, ctx);

      expect(result).toMatchObject({ ok: false, error: { code: 'message.not_retryable' } });
      expect(gateway.pushes).toEqual([]);
    },
  );

  it('returns message.not_retryable for an inbound message', async () => {
    const c = await givenContact();
    const { message } = await messages.insertInboundIfAbsent(
      row(c.id, {
        direction: 'inbound',
        author: 'customer',
        lineMessageId: 'line-1' as LineMessageId, // brand: test id
        deliveryStatus: 'failed',
        retryKey: null,
      }),
    );

    expect(await retryWith()({ contactId: c.id, messageId: message.id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'message.not_retryable' },
    });
  });

  it('returns message.not_found when the contactId does not match the message', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);

    expect(await retryWith()({ contactId: ids.contactId(), messageId: m.id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'message.not_found' },
    });
    expect((await messages.findById(m.id))?.deliveryStatus).toBe('failed');
  });

  it('returns message.not_found for an unknown message', async () => {
    const c = await givenContact();

    expect(await retryWith()({ contactId: c.id, messageId: ids.messageId() }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'message.not_found' },
    });
  });

  it('returns message.not_found when the contact row is gone', async () => {
    // A repository without the foreign key, so a message can outlive its contact.
    const loose = new FakeMessageRepository();
    const contactId = ids.contactId();
    const { message } = await loose.insertOutboundIfAbsent(row(contactId));
    await loose.markFailed(message.id, 'line.unavailable');

    expect(await retryWith(loose)({ contactId, messageId: message.id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'message.not_found' },
    });
  });

  it('makes only one of two concurrent retries call LINE; the other gets message.not_retryable', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);
    const retry = retryWith();

    const results = await Promise.all([
      retry({ contactId: c.id, messageId: m.id }, ctx),
      retry({ contactId: c.id, messageId: m.id }, ctx),
    ]);

    expect(gateway.pushes).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      ok: false,
      error: { code: 'message.not_retryable' },
    });
  });

  it('returns ok with the new error code when the push fails again', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);
    gateway.failNext('push', 'line.quota_exceeded');

    const result = await retryWith()({ contactId: c.id, messageId: m.id }, ctx);

    expect(result).toMatchObject({
      ok: true,
      value: { deliveryStatus: 'failed', deliveryError: 'line.quota_exceeded' },
    });
    expect((await settings.get()).lastLineError).toEqual({
      code: 'line.quota_exceeded',
      at: clock.now(),
    });
  });

  it('retries a failed AI message the same way', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id, 'ai');

    const result = await retryWith()({ contactId: c.id, messageId: m.id }, ctx);

    expect(result).toMatchObject({ ok: true, value: { author: 'ai', deliveryStatus: 'sent' } });
    expect(gateway.pushes[0]?.retryKey).toBe(m.id);
  });

  it('returns contact.unfollowed and leaves the message failed', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);
    await contacts.setFollowStatus(c.id, 'unfollowed', clock.now());

    expect(await retryWith()({ contactId: c.id, messageId: m.id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'contact.unfollowed' },
    });
    expect((await messages.findById(m.id))?.deliveryStatus).toBe('failed');
    expect(gateway.pushes).toEqual([]);
  });

  it('returns line.not_configured and leaves the message failed', async () => {
    settings = new FakeSettingsRepository();
    const c = await givenContact();
    const m = await givenFailed(c.id);

    expect(await retryWith()({ contactId: c.id, messageId: m.id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'line.not_configured' },
    });
    expect((await messages.findById(m.id))?.deliveryStatus).toBe('failed');
  });

  it('returns line.credentials_unreadable when the credentials cannot be decrypted', async () => {
    cipher = new FakeSecretCipher('another-key');
    const c = await givenContact();
    const m = await givenFailed(c.id);

    expect(await retryWith()({ contactId: c.id, messageId: m.id }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'line.credentials_unreadable' },
    });
    expect((await messages.findById(m.id))?.deliveryStatus).toBe('failed');
  });

  it('returns message.rate_limited with retryAfterSeconds over RATE_LIMIT_SEND_MESSAGE', async () => {
    const c = await givenContact();
    const m = await givenFailed(c.id);
    const retry = retryWith();
    for (let i = 0; i < RATE_LIMIT_SEND_MESSAGE.limit; i += 1) {
      await retry({ contactId: c.id, messageId: ids.messageId() }, ctx);
    }

    expect(await retry({ contactId: c.id, messageId: m.id }, ctx)).toEqual({
      ok: false,
      error: { code: 'message.rate_limited', detail: undefined, retryAfterSeconds: 50 },
    });
    expect(gateway.pushes).toEqual([]);
  });

  it('shares the send_message budget with SendAdminMessage and counts a null IP as one subject', async () => {
    const send = makeSendAdminMessage(
      {
        messages,
        contacts,
        settings,
        cipher,
        gateway,
        storage: new FakeFileStorage(),
        rateLimits,
        hasher,
        ids,
        clock,
        logger,
      },
      config,
    );
    const c = await givenContact();
    const m = await givenFailed(c.id);
    const noIp = { requestId: 'req-2', clientIp: null };
    for (let i = 0; i < RATE_LIMIT_SEND_MESSAGE.limit; i += 1) {
      await send(
        { contactId: c.id, messageId: ids.messageId(), content: { kind: 'text', text: 'a' } },
        noIp,
      );
    }

    expect(await retryWith()({ contactId: c.id, messageId: m.id }, noIp)).toMatchObject({
      ok: false,
      error: { code: 'message.rate_limited' },
    });
  });

  it('adds no second ai.turned_off_by_admin line and leaves the switches alone on retry', async () => {
    const send = makeSendAdminMessage(
      {
        messages,
        contacts,
        settings,
        cipher,
        gateway,
        storage: new FakeFileStorage(),
        rateLimits,
        hasher,
        ids,
        clock,
        logger,
      },
      config,
    );
    const c = await givenContact();
    await contacts.setAiEnabled(c.id, true);
    gateway.failNext('push', 'line.unavailable');
    const messageId = ids.messageId();
    const first = await send(
      { contactId: c.id, messageId, content: { kind: 'text', text: 'สวัสดีค่ะ' } },
      ctx,
    );
    expect(first).toMatchObject({ ok: true, value: { deliveryStatus: 'failed' } });
    // The admin turns AI back on before pressing "send again".
    await contacts.setAiEnabled(c.id, true);

    const result = await retryWith()({ contactId: c.id, messageId }, ctx);

    expect(result).toMatchObject({ ok: true, value: { deliveryStatus: 'sent' } });
    const events = (await messages.listLatest(c.id, 100)).messages.filter(
      (x) => x.eventCode === 'ai.turned_off_by_admin',
    );
    expect(events).toHaveLength(1);
    expect((await contacts.findById(c.id))?.aiEnabled).toBe(true);
    expect(gateway.pushes).toHaveLength(1);
    expect(gateway.pushes[0]?.retryKey).toBe(messageId);
  });

  it('logs no message text, LINE user id or access token', async () => {
    const c = await givenContact();
    const { message } = await messages.insertOutboundIfAbsent(row(c.id, { text: 'private text' }));
    await messages.markFailed(message.id, 'line.unavailable');
    gateway.failNext('push', 'line.unavailable');

    await retryWith()({ contactId: c.id, messageId: message.id }, ctx);

    const dump = JSON.stringify(logger.entries);
    expect(logger.eventsOf()).toContain('line.send.failed');
    expect(dump).not.toContain('private text');
    expect(dump).not.toContain(LINE_USER);
    expect(dump).not.toContain(FAKE_LINE_ACCESS_TOKEN);
    expect(dump).not.toContain(ctx.clientIp);
  });
});
