import { beforeEach, describe, expect, it } from 'vitest';
import type { Contact, LineCredentials, LineUserId, Message, MessageId } from '@/core/domain';
import { REPLY_TOKEN_USABLE_MS } from '@/core/domain';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { makeDeliverOutbound, type DeliverOutbound } from './deliver-outbound';

const access: LineCredentials = {
  channelSecret: FAKE_LINE_CHANNEL_SECRET,
  channelAccessToken: FAKE_LINE_ACCESS_TOKEN,
};
const LINE_USER = 'U-customer-1' as LineUserId; // brand: test id

describe('deliverOutbound', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let gateway: FakeMessagingGateway;
  let settings: FakeSettingsRepository;
  let logger: FakeLogger;
  let deliver: DeliverOutbound;

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    gateway = new FakeMessagingGateway();
    settings = new FakeSettingsRepository();
    logger = new FakeLogger(clock);
    deliver = makeDeliverOutbound({ contacts, messages, gateway, settings, clock, logger });
  });

  /** A contact; with `replyToken` it also holds that token, received just now. */
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
    const fresh = await contacts.findById(contact.id);
    if (fresh === null) throw new Error('contact missing');
    return fresh;
  };

  const givenPendingText = async (contact: Contact, text = 'สวัสดีค่ะ'): Promise<Message> => {
    const id: MessageId = ids.messageId();
    const { message } = await messages.insertOutboundIfAbsent({
      id,
      contactId: contact.id,
      direction: 'outbound',
      author: 'admin',
      type: 'text',
      text,
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
    });
    return message;
  };

  describe('mode auto', () => {
    it('uses a usable reply token first and marks the message sent', async () => {
      const contact = await givenContact('rt-1');
      const message = await givenPendingText(contact);
      clock.advance(1_000);

      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.replies).toEqual([
        {
          token: FAKE_LINE_ACCESS_TOKEN,
          replyToken: 'rt-1',
          parts: [{ type: 'text', text: 'สวัสดีค่ะ' }],
        },
      ]);
      expect(gateway.pushes).toEqual([]);
      expect(result.deliveryStatus).toBe('sent');
      expect(result.deliveryError).toBeNull();
      expect(result.sentAt).toEqual(clock.now());
      expect((await contacts.findById(contact.id))?.replyToken).toBeNull();
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'line.send.succeeded',
          channel: 'reply',
          messageId: message.id,
        }),
      );
    });

    it('pushes with retry key = message id when LINE rejects the reply token', async () => {
      const contact = await givenContact('rt-bad');
      gateway.invalidReplyTokens.add('rt-bad');
      const message = await givenPendingText(contact);

      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toHaveLength(1);
      expect(gateway.pushes[0]).toMatchObject({ to: LINE_USER, retryKey: message.id });
      expect(result.deliveryStatus).toBe('sent');
      expect(logger.eventsOf()).toEqual(['line.send.reply_token_rejected', 'line.send.succeeded']);
      expect(logger.entries[1]).toMatchObject({ channel: 'push' });
    });

    it('marks line.reply_failed and never pushes the same payload after a validation 400', async () => {
      const contact = await givenContact('rt-1');
      // What the adapter answers for a 400 whose body is not "Invalid reply token".
      gateway.failNext('reply', 'line.reply_failed');
      const message = await givenPendingText(contact);

      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.pushes).toEqual([]);
      expect(result).toMatchObject({
        deliveryStatus: 'failed',
        deliveryError: 'line.reply_failed',
        firstPushAt: null,
      });
      expect(logger.eventsOf()).toEqual(['line.send.failed']);
      expect(logger.entries[0]).toMatchObject({ channel: 'reply', errorCode: 'line.reply_failed' });
    });

    it('dates the first push, and a reply leaves it unset', async () => {
      const replied = await deliver(
        await givenPendingText(await givenContact('rt-1')),
        await givenContact(),
        access,
        'auto',
      );
      expect(replied).toMatchObject({ deliveryStatus: 'sent', firstPushAt: null });

      const contact = await givenContact();
      const message = await givenPendingText(contact);
      const firstAt = clock.now();
      gateway.failNext('push', 'line.unavailable');
      const failed = await deliver(message, contact, access, 'auto');
      expect(failed).toMatchObject({ deliveryStatus: 'failed', firstPushAt: firstAt });

      // A later push (send again) keeps the time of the first one.
      clock.advance(60_000);
      const again = await deliver(failed, contact, access, 'push_only');
      expect(again).toMatchObject({ deliveryStatus: 'sent', firstPushAt: firstAt });
    });

    it('marks failed and never pushes when the reply outcome is unknown (line.unavailable)', async () => {
      const contact = await givenContact('rt-1');
      gateway.failNext('reply', 'line.unavailable');
      const message = await givenPendingText(contact);

      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.pushes).toEqual([]);
      expect(result.deliveryStatus).toBe('failed');
      expect(result.deliveryError).toBe('line.unavailable');
      expect((await settings.get()).lastLineError).toEqual({
        code: 'line.unavailable',
        at: clock.now(),
      });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'error',
          event: 'line.send.failed',
          channel: 'reply',
          errorCode: 'line.unavailable',
        }),
      );
    });

    it.each(['line.unauthorized', 'line.rate_limited', 'line.reply_failed'] as const)(
      'marks failed without push when reply returns %s',
      async (code) => {
        const contact = await givenContact('rt-1');
        gateway.failNext('reply', code);
        const message = await givenPendingText(contact);

        const result = await deliver(message, contact, access, 'auto');

        expect(gateway.pushes).toEqual([]);
        expect(result.deliveryStatus).toBe('failed');
        expect(result.deliveryError).toBe(code);
      },
    );

    it('pushes when the contact has no reply token', async () => {
      const contact = await givenContact();
      const message = await givenPendingText(contact);

      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toHaveLength(1);
      expect(result.deliveryStatus).toBe('sent');
    });

    it('pushes when the reply token is past REPLY_TOKEN_USABLE_MS', async () => {
      const contact = await givenContact('rt-old');
      const message = await givenPendingText(contact);
      clock.advance(REPLY_TOKEN_USABLE_MS);

      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toHaveLength(1);
      expect(result.deliveryStatus).toBe('sent');
      // The expired token is not consumed.
      expect((await contacts.findById(contact.id))?.replyToken).toBe('rt-old');
    });

    it('pushes when another sender already consumed the token', async () => {
      const contact = await givenContact('rt-1');
      expect(await contacts.consumeReplyToken(contact.id, 'rt-1')).toBe(true);
      const message = await givenPendingText(contact);

      // `contact` is the stale snapshot that still shows the token.
      const result = await deliver(message, contact, access, 'auto');

      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toHaveLength(1);
      expect(result.deliveryStatus).toBe('sent');
    });

    it('uses a reply token only once for two concurrent messages', async () => {
      const contact = await givenContact('rt-1');
      const a = await givenPendingText(contact, 'a');
      const b = await givenPendingText(contact, 'b');

      const [ra, rb] = await Promise.all([
        deliver(a, contact, access, 'auto'),
        deliver(b, contact, access, 'auto'),
      ]);

      expect(gateway.replies).toHaveLength(1);
      expect(gateway.pushes).toHaveLength(1);
      expect([ra.deliveryStatus, rb.deliveryStatus]).toEqual(['sent', 'sent']);
    });
  });

  describe('mode push_only', () => {
    it('does not use a reply token even while it is usable', async () => {
      const contact = await givenContact('rt-1');
      const message = await givenPendingText(contact);

      const result = await deliver(message, contact, access, 'push_only');

      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toEqual([
        {
          token: FAKE_LINE_ACCESS_TOKEN,
          to: LINE_USER,
          parts: [{ type: 'text', text: 'สวัสดีค่ะ' }],
          retryKey: message.id,
        },
      ]);
      expect(result.deliveryStatus).toBe('sent');
      // The token is left for a later message.
      expect((await contacts.findById(contact.id))?.replyToken).toBe('rt-1');
    });

    it('treats a push LINE already accepted (same retry key) as sent', async () => {
      const contact = await givenContact();
      const message = await givenPendingText(contact);
      await deliver(message, contact, access, 'push_only');
      await messages.markFailed(message.id, 'line.unavailable');

      const result = await deliver(message, contact, access, 'push_only');

      expect(gateway.pushes).toHaveLength(1);
      expect(result.deliveryStatus).toBe('sent');
      expect(result.deliveryError).toBeNull();
    });

    it.each([
      'line.unauthorized',
      'line.quota_exceeded',
      'line.rate_limited',
      'line.push_failed',
      'line.unavailable',
    ] as const)('marks failed and records the LINE error when push returns %s', async (code) => {
      const contact = await givenContact();
      gateway.failNext('push', code);
      const message = await givenPendingText(contact);

      const result = await deliver(message, contact, access, 'push_only');

      expect(result.deliveryStatus).toBe('failed');
      expect(result.deliveryError).toBe(code);
      expect((await settings.get()).lastLineError).toEqual({ code, at: clock.now() });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.send.failed', channel: 'push', errorCode: code }),
      );
    });

    it('falls back to the message id as retry key when retryKey is missing', async () => {
      const contact = await givenContact();
      const message = await givenPendingText(contact);

      await deliver({ ...message, retryKey: null }, contact, access, 'push_only');

      expect(gateway.pushes[0]?.retryKey).toBe(message.id);
    });
  });

  it('sends image parts with the original and preview URLs', async () => {
    const contact = await givenContact();
    const text = await givenPendingText(contact);
    const image: Message = {
      ...text,
      type: 'image',
      text: null,
      mediaUrl: 'https://media.example/o.jpg',
      previewUrl: 'https://media.example/p.jpg',
      mediaStatus: 'ready',
    };

    await deliver(image, contact, access, 'auto');

    expect(gateway.pushes[0]?.parts).toEqual([
      {
        type: 'image',
        originalUrl: 'https://media.example/o.jpg',
        previewUrl: 'https://media.example/p.jpg',
      },
    ]);
  });

  it('logs no message text, token or LINE user id', async () => {
    const contact = await givenContact('rt-secret');
    gateway.invalidReplyTokens.add('rt-secret');
    gateway.failNext('push', 'line.unavailable');
    const message = await givenPendingText(contact, 'private text');

    await deliver(message, contact, access, 'auto');

    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain('private text');
    expect(dump).not.toContain('rt-secret');
    expect(dump).not.toContain(LINE_USER);
    expect(dump).not.toContain(FAKE_LINE_ACCESS_TOKEN);
  });
});
