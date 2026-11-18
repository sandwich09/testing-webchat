import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Contact,
  ContactId,
  LineUserId,
  MessageId,
  StorageKey,
  UploadId,
} from '@/core/domain';
import {
  ADMIN_TEXT_MAX_CHARS,
  IMAGE_MAX_BYTES,
  PREVIEW_MAX_BYTES,
  PRICE_TABLE,
  REPLY_TOKEN_USABLE_MS,
  RATE_LIMIT_SEND_MESSAGE,
  VIDEO_MAX_BYTES,
  outboundStorageKeys,
} from '@/core/domain';
import type { FileStorage } from '@/core/ports';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FAKE_STORAGE_BASE_URL,
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
import { makeSendAdminMessage, type SendAdminMessageInput } from './send-admin-message.use-case';
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
const UPLOAD = 'AAAAAAAAAAAAAAAAAAAAAA' as UploadId; // brand: test upload token

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypisom'), 0, 0, 2, 0]);
const MOV = new Uint8Array([0, 0, 0, 0x14, ...ascii('ftypqt  '), 0, 0, 2, 0]);

/** FakeFileStorage that can report a larger size for a key without holding the bytes. */
class SizedFileStorage extends FakeFileStorage {
  readonly sizes = new Map<string, number>();

  override async inspect(key: StorageKey): ReturnType<FileStorage['inspect']> {
    const found = await super.inspect(key);
    const size = this.sizes.get(key);
    if (!found.ok || size === undefined) return found;
    return { ok: true, value: { ...found.value, sizeBytes: size } };
  }
}

describe('SendAdminMessage', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let settings: FakeSettingsRepository;
  let cipher: FakeSecretCipher;
  let gateway: FakeMessagingGateway;
  let storage: SizedFileStorage;
  let rateLimits: FakeRateLimitRepository;
  let logger: FakeLogger;
  let send: ReturnType<typeof makeSendAdminMessage>;

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:10.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    settings = new FakeSettingsRepository();
    cipher = new FakeSecretCipher();
    gateway = new FakeMessagingGateway();
    storage = new SizedFileStorage();
    rateLimits = new FakeRateLimitRepository();
    logger = new FakeLogger(clock);
    send = makeSendAdminMessage(
      {
        messages,
        contacts,
        settings,
        cipher,
        gateway,
        storage,
        rateLimits,
        hasher: new FakeContentHasher(),
        ids,
        clock,
        logger,
      },
      config,
    );
    await configureLine();
  });

  const configureLine = (): Promise<void> =>
    settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'Shop', basicId: '@shop' },
    );

  const givenContact = async (
    opts: { replyToken?: string; aiEnabled?: boolean; needsAdmin?: boolean } = {},
  ): Promise<Contact> => {
    const { contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: LINE_USER,
      now: clock.now(),
    });
    if (opts.replyToken !== undefined) {
      await contacts.recordInbound(contact.id, {
        at: clock.now(),
        preview: { type: 'text', text: 'hi' },
        replyToken: opts.replyToken,
        replyTokenExpiresAt: new Date(clock.now().getTime() + REPLY_TOKEN_USABLE_MS),
      });
    }
    if (opts.aiEnabled === true) await contacts.setAiEnabled(contact.id, true);
    if (opts.needsAdmin === true)
      await contacts.setNeedsAdmin(contact.id, 'customer_sent_non_text');
    return fresh(contact.id);
  };

  const fresh = async (id: ContactId): Promise<Contact> => {
    const c = await contacts.findById(id);
    if (c === null) throw new Error('contact missing');
    return c;
  };

  const textInput = (contactId: ContactId, text = 'สวัสดีค่ะ', messageId?: MessageId) => ({
    contactId,
    messageId: messageId ?? ids.messageId(),
    content: { kind: 'text' as const, text },
  });

  const mediaInput = (
    contactId: ContactId,
    kind: 'image' | 'video',
    contentType: string,
    uploadId: UploadId = UPLOAD,
  ): SendAdminMessageInput => ({
    contactId,
    messageId: ids.messageId(),
    content: { kind, uploadId, contentType },
  });

  const seedUpload = (contentType: string, original: Uint8Array, preview: Uint8Array = JPEG) => {
    const keys = outboundStorageKeys(UPLOAD, contentType);
    storage.seed(keys.original, original, contentType);
    storage.seed(keys.preview, preview, 'image/jpeg');
    return keys;
  };

  const eventLines = async (contactId: ContactId) =>
    (await messages.listLatest(contactId, 100)).messages.filter((m) => m.type === 'event');

  describe('delivery', () => {
    it('sends a text through a usable reply token and consumes it', async () => {
      const c = await givenContact({ replyToken: 'rt-1' });
      const input = textInput(c.id);

      const result = await send(input, ctx);

      expect(result).toMatchObject({
        ok: true,
        value: { id: input.messageId, deliveryStatus: 'sent' },
      });
      expect(gateway.replies).toEqual([
        {
          token: FAKE_LINE_ACCESS_TOKEN,
          replyToken: 'rt-1',
          parts: [{ type: 'text', text: 'สวัสดีค่ะ' }],
        },
      ]);
      expect(gateway.pushes).toEqual([]);
      expect((await fresh(c.id)).replyToken).toBeNull();
    });

    it('pushes with retryKey equal to the message id when there is no reply token', async () => {
      const c = await givenContact();
      const input = textInput(c.id);

      const result = await send(input, ctx);

      expect(result).toMatchObject({
        ok: true,
        value: { deliveryStatus: 'sent', retryKey: input.messageId },
      });
      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toEqual([
        {
          token: FAKE_LINE_ACCESS_TOKEN,
          to: LINE_USER,
          parts: [{ type: 'text', text: 'สวัสดีค่ะ' }],
          retryKey: input.messageId,
        },
      ]);
    });

    it('accepts a text of ADMIN_TEXT_MAX_CHARS characters', async () => {
      const c = await givenContact();
      const text = 'ก'.repeat(ADMIN_TEXT_MAX_CHARS);

      const result = await send(textInput(c.id, text), ctx);

      expect(result).toMatchObject({ ok: true, value: { text, deliveryStatus: 'sent' } });
      expect(gateway.pushes[0]?.parts).toEqual([{ type: 'text', text }]);
    });

    it('returns ok with a failed message and records lastLineError when push is unauthorized', async () => {
      const c = await givenContact();
      gateway.failNext('push', 'line.unauthorized');

      const result = await send(textInput(c.id), ctx);

      expect(result).toMatchObject({
        ok: true,
        value: { deliveryStatus: 'failed', deliveryError: 'line.unauthorized' },
      });
      expect((await settings.get()).lastLineError).toEqual({
        code: 'line.unauthorized',
        at: clock.now(),
      });
    });

    it('returns a failed message with line.quota_exceeded when the push quota is used up', async () => {
      const c = await givenContact();
      gateway.quotaExceeded = true;

      const result = await send(textInput(c.id), ctx);

      expect(result).toMatchObject({
        ok: true,
        value: { deliveryStatus: 'failed', deliveryError: 'line.quota_exceeded' },
      });
    });

    it('is sent when LINE answers that it already accepted this retry key', async () => {
      const c = await givenContact();
      const input = textInput(c.id);
      // An earlier attempt that reached LINE before this process lost the answer.
      await gateway.push(
        FAKE_LINE_ACCESS_TOKEN,
        LINE_USER,
        [{ type: 'text', text: 'x' }],
        input.messageId,
      );

      const result = await send(input, ctx);

      expect(result).toMatchObject({ ok: true, value: { deliveryStatus: 'sent' } });
      expect(gateway.pushes).toHaveLength(1);
    });
  });

  describe('idempotency on the client-made id', () => {
    it('returns the stored row for a repeat after success without calling LINE again', async () => {
      const c = await givenContact({ aiEnabled: true });
      const input = textInput(c.id);
      const first = await send(input, ctx);

      const second = await send(input, ctx);

      expect(second).toEqual(first);
      expect(gateway.pushes).toHaveLength(1);
      expect(await eventLines(c.id)).toHaveLength(1);
    });

    it('stores one message, delivers once and adds one event line for two concurrent requests', async () => {
      const c = await givenContact({ aiEnabled: true });
      const input = textInput(c.id);

      const [a, b] = await Promise.all([send(input, ctx), send(input, ctx)]);

      expect(a.ok && b.ok).toBe(true);
      expect(gateway.pushes).toHaveLength(1);
      const rows = (await messages.listLatest(c.id, 100)).messages;
      expect(rows.filter((m) => m.id === input.messageId)).toHaveLength(1);
      expect(await eventLines(c.id)).toHaveLength(1);
      // The loser answers with the row it read back: pending while the winner is sending.
      const statuses = [a, b].map((r) => (r.ok ? r.value.deliveryStatus : null)).sort();
      expect(statuses).toEqual(['pending', 'sent']);
    });

    it('returns message.id_conflict for the same id with another contactId', async () => {
      const c = await givenContact();
      const { contact: other } = await contacts.ensure({
        id: ids.contactId(),
        lineUserId: 'U-customer-2' as LineUserId, // brand: test id
        now: clock.now(),
      });
      const input = textInput(c.id);
      await send(input, ctx);

      const result = await send({ ...input, contactId: other.id }, ctx);

      expect(result).toMatchObject({ ok: false, error: { code: 'message.id_conflict' } });
      expect(gateway.pushes).toHaveLength(1);
    });

    it('returns message.id_conflict for the same id with different content', async () => {
      const c = await givenContact();
      const input = textInput(c.id, 'first');
      await send(input, ctx);

      const otherText = await send({ ...input, content: { kind: 'text', text: 'second' } }, ctx);
      const otherKind = await send(
        { ...input, content: { kind: 'image', uploadId: UPLOAD, contentType: 'image/jpeg' } },
        ctx,
      );

      expect(otherText).toMatchObject({ ok: false, error: { code: 'message.id_conflict' } });
      expect(otherKind).toMatchObject({ ok: false, error: { code: 'message.id_conflict' } });
      expect(gateway.pushes).toHaveLength(1);
      expect((await messages.findById(input.messageId))?.text).toBe('first');
    });

    it('returns the stored media message for a repeat with the same upload', async () => {
      const c = await givenContact();
      seedUpload('image/jpeg', JPEG);
      const input = mediaInput(c.id, 'image', 'image/jpeg');
      const first = await send(input, ctx);

      expect(await send(input, ctx)).toEqual(first);
      expect(gateway.pushes).toHaveLength(1);
    });

    it('returns message.id_conflict when the id belongs to a message that is not an admin outbound', async () => {
      const c = await givenContact();
      const id = ids.messageId();
      await messages.insertEvent({
        id,
        contactId: c.id,
        direction: 'internal',
        author: 'system',
        type: 'event',
        text: null,
        mediaUrl: null,
        previewUrl: null,
        mediaStatus: null,
        stickerPackageId: null,
        stickerId: null,
        otherKind: null,
        eventCode: 'ai.turned_off_by_admin',
        lineMessageId: null,
        deliveryStatus: null,
        deliveryError: null,
        retryKey: null,
        createdAt: clock.now(),
        sentAt: null,
      });

      const result = await send(textInput(c.id, 'hi', id), ctx);

      expect(result).toMatchObject({ ok: false, error: { code: 'message.id_conflict' } });
      expect(gateway.pushes).toEqual([]);
    });

    it('does not count a repeat against the rate limit', async () => {
      const c = await givenContact();
      const input = textInput(c.id);
      await send(input, ctx);
      for (let i = 1; i < RATE_LIMIT_SEND_MESSAGE.limit; i += 1) await send(textInput(c.id), ctx);

      expect((await send(input, ctx)).ok).toBe(true);
      expect(await send(textInput(c.id), ctx)).toMatchObject({
        ok: false,
        error: { code: 'message.rate_limited' },
      });
    });
  });

  describe('refusals before anything is stored', () => {
    it('returns message.rate_limited with retryAfterSeconds over RATE_LIMIT_SEND_MESSAGE', async () => {
      const c = await givenContact();
      for (let i = 0; i < RATE_LIMIT_SEND_MESSAGE.limit; i += 1) {
        expect((await send(textInput(c.id), ctx)).ok).toBe(true);
      }
      const input = textInput(c.id);

      const result = await send(input, ctx);

      // 10 s into the one-minute window.
      expect(result).toEqual({
        ok: false,
        error: { code: 'message.rate_limited', detail: undefined, retryAfterSeconds: 50 },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
      expect(gateway.pushes).toHaveLength(RATE_LIMIT_SEND_MESSAGE.limit);
    });

    it('counts a null client IP under one shared subject', async () => {
      const c = await givenContact();
      const noIp = { requestId: 'req-2', clientIp: null };
      for (let i = 0; i < RATE_LIMIT_SEND_MESSAGE.limit; i += 1) await send(textInput(c.id), noIp);

      expect(await send(textInput(c.id), noIp)).toMatchObject({
        ok: false,
        error: { code: 'message.rate_limited' },
      });
      expect((await send(textInput(c.id), ctx)).ok).toBe(true);
    });

    it('returns contact.not_found for an unknown contact', async () => {
      const input = textInput(ids.contactId());

      expect(await send(input, ctx)).toMatchObject({
        ok: false,
        error: { code: 'contact.not_found' },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
    });

    it('returns contact.unfollowed, stores nothing and does not call LINE', async () => {
      const c = await givenContact({ aiEnabled: true, needsAdmin: true });
      await contacts.setFollowStatus(c.id, 'unfollowed', clock.now());
      const input = textInput(c.id);

      const result = await send(input, ctx);

      expect(result).toMatchObject({ ok: false, error: { code: 'contact.unfollowed' } });
      expect(await messages.findById(input.messageId)).toBeNull();
      expect(await eventLines(c.id)).toEqual([]);
      expect(gateway.pushes).toEqual([]);
      expect(gateway.replies).toEqual([]);
      expect(await fresh(c.id)).toMatchObject({
        aiEnabled: true,
        needsAdmin: true,
        lastMessageBy: null,
      });
    });

    it('returns line.not_configured and stores nothing', async () => {
      settings = new FakeSettingsRepository();
      send = makeSendAdminMessage(
        {
          messages,
          contacts,
          settings,
          cipher,
          gateway,
          storage,
          rateLimits,
          hasher: new FakeContentHasher(),
          ids,
          clock,
          logger,
        },
        config,
      );
      const c = await givenContact({ aiEnabled: true });
      const input = textInput(c.id);

      const result = await send(input, ctx);

      expect(result).toMatchObject({ ok: false, error: { code: 'line.not_configured' } });
      expect(await messages.findById(input.messageId)).toBeNull();
      expect(await eventLines(c.id)).toEqual([]);
      expect((await fresh(c.id)).aiEnabled).toBe(true);
      expect(gateway.pushes).toEqual([]);
    });

    it('returns line.credentials_unreadable when the stored credentials cannot be decrypted', async () => {
      await settings.saveLineCredentials(
        {
          channelSecretEnc: new FakeSecretCipher('another-key').encrypt('s'),
          channelAccessTokenEnc: new FakeSecretCipher('another-key').encrypt('t'),
        },
        { botName: 'Shop', basicId: '@shop' },
      );
      const c = await givenContact();
      const input = textInput(c.id);

      expect(await send(input, ctx)).toMatchObject({
        ok: false,
        error: { code: 'line.credentials_unreadable' },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
    });
  });

  describe('AI switch and waiting state', () => {
    it('turns the contact AI off and adds one ai.turned_off_by_admin line when it was on', async () => {
      const c = await givenContact({ aiEnabled: true });
      const input = textInput(c.id);

      await send(input, ctx);

      expect((await fresh(c.id)).aiEnabled).toBe(false);
      const events = await eventLines(c.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        contactId: c.id,
        direction: 'internal',
        author: 'system',
        eventCode: 'ai.turned_off_by_admin',
        deliveryStatus: null,
        createdAt: clock.now(),
      });
    });

    it('adds no event line when the contact AI was already off', async () => {
      const c = await givenContact();

      await send(textInput(c.id), ctx);

      expect(await eventLines(c.id)).toEqual([]);
      expect((await fresh(c.id)).aiEnabled).toBe(false);
    });

    it('clears needsAdmin of a chat that waits for an admin', async () => {
      const c = await givenContact({ needsAdmin: true });

      await send(textInput(c.id), ctx);

      expect(await fresh(c.id)).toMatchObject({ needsAdmin: false, needsAdminReason: null });
    });

    it('still turns AI off and clears needsAdmin when the delivery fails', async () => {
      const c = await givenContact({ aiEnabled: true, needsAdmin: true });
      gateway.failNext('push', 'line.push_failed');

      const result = await send(textInput(c.id), ctx);

      expect(result).toMatchObject({ ok: true, value: { deliveryStatus: 'failed' } });
      expect(await fresh(c.id)).toMatchObject({ aiEnabled: false, needsAdmin: false });
      expect(await eventLines(c.id)).toHaveLength(1);
    });
  });

  it('makes this message the last one in the contact list, by admin, without touching unreadCount', async () => {
    const c = await givenContact({ replyToken: 'rt-1' });
    await contacts.recordInbound(c.id, {
      at: clock.now(),
      preview: { type: 'text', text: 'again' },
      replyToken: null,
      replyTokenExpiresAt: null,
    });
    clock.advance(1_000);

    await send(textInput(c.id, 'ตอบกลับ'), ctx);

    expect(await fresh(c.id)).toMatchObject({
      unreadCount: 2,
      lastMessageAt: clock.now(),
      lastMessagePreview: 'ตอบกลับ',
      lastMessageType: 'text',
      lastMessageBy: 'admin',
    });
  });

  describe('media', () => {
    it('sends a JPEG with the public URLs of the keys made from uploadId', async () => {
      const c = await givenContact();
      const keys = seedUpload('image/jpeg', JPEG);
      const input = mediaInput(c.id, 'image', 'image/jpeg');

      const result = await send(input, ctx);

      const originalUrl = `${FAKE_STORAGE_BASE_URL}/api/local-storage/outbound/${UPLOAD}/original.jpg`;
      const previewUrl = `${FAKE_STORAGE_BASE_URL}/api/local-storage/outbound/${UPLOAD}/preview.jpg`;
      expect([keys.original, keys.preview]).toEqual([
        `outbound/${UPLOAD}/original.jpg`,
        `outbound/${UPLOAD}/preview.jpg`,
      ]);
      expect(result).toMatchObject({
        ok: true,
        value: {
          type: 'image',
          text: null,
          mediaUrl: originalUrl,
          previewUrl,
          mediaStatus: 'ready',
          deliveryStatus: 'sent',
        },
      });
      expect(gateway.pushes[0]?.parts).toEqual([{ type: 'image', originalUrl, previewUrl }]);
      expect(await fresh(c.id)).toMatchObject({
        lastMessageType: 'image',
        lastMessagePreview: null,
      });
    });

    it('sends a PNG image and an MP4 video', async () => {
      const c = await givenContact();
      seedUpload('image/png', PNG);
      seedUpload('video/mp4', MP4);

      const png = await send(mediaInput(c.id, 'image', 'image/png'), ctx);
      const mp4 = await send(mediaInput(c.id, 'video', 'video/mp4'), ctx);

      expect(png).toMatchObject({ ok: true, value: { type: 'image', deliveryStatus: 'sent' } });
      expect(mp4).toMatchObject({ ok: true, value: { type: 'video', deliveryStatus: 'sent' } });
      expect(gateway.pushes[1]?.parts[0]).toMatchObject({ type: 'video' });
    });

    it.each([
      ['video', 'video/quicktime'],
      ['image', 'image/webp'],
      ['image', 'video/mp4'],
      ['video', 'image/jpeg'],
    ] as const)('returns upload.type_not_allowed for %s declared as %s', async (kind, type) => {
      const c = await givenContact();
      const input = mediaInput(c.id, kind, type);

      expect(await send(input, ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.type_not_allowed' },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
    });

    it('returns upload.not_found when no file is at the key yet', async () => {
      const c = await givenContact();
      const input = mediaInput(c.id, 'image', 'image/jpeg');

      expect(await send(input, ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.not_found' },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
    });

    it('returns upload.not_found for an uploadId whose files are elsewhere', async () => {
      const c = await givenContact();
      seedUpload('image/jpeg', JPEG);

      const result = await send(
        mediaInput(c.id, 'image', 'image/jpeg', 'BBBBBBBBBBBBBBBBBBBBBB' as UploadId), // brand: test upload token
        ctx,
      );

      expect(result).toMatchObject({ ok: false, error: { code: 'upload.not_found' } });
    });

    it('returns upload.not_found when the file was uploaded under another content type', async () => {
      const c = await givenContact();
      seedUpload('image/png', PNG);

      expect(await send(mediaInput(c.id, 'image', 'image/jpeg'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.not_found' },
      });
    });

    it('returns upload.not_found when the preview is missing', async () => {
      const c = await givenContact();
      storage.seed(outboundStorageKeys(UPLOAD, 'image/jpeg').original, JPEG, 'image/jpeg');

      expect(await send(mediaInput(c.id, 'image', 'image/jpeg'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.not_found' },
      });
    });

    it('returns upload.content_mismatch for a PNG declared as JPEG', async () => {
      const c = await givenContact();
      seedUpload('image/jpeg', PNG);

      expect(await send(mediaInput(c.id, 'image', 'image/jpeg'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.content_mismatch' },
      });
    });

    it('returns upload.content_mismatch for a MOV file declared as MP4', async () => {
      const c = await givenContact();
      seedUpload('video/mp4', MOV);

      expect(await send(mediaInput(c.id, 'video', 'video/mp4'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.content_mismatch' },
      });
    });

    it('returns upload.content_mismatch when the preview is not a JPEG', async () => {
      const c = await givenContact();
      seedUpload('image/jpeg', JPEG, PNG);

      expect(await send(mediaInput(c.id, 'image', 'image/jpeg'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.content_mismatch' },
      });
    });

    it('returns upload.too_large for a video over VIDEO_MAX_BYTES', async () => {
      const c = await givenContact();
      const keys = seedUpload('video/mp4', MP4);
      storage.sizes.set(keys.original, VIDEO_MAX_BYTES + 1);
      const input = mediaInput(c.id, 'video', 'video/mp4');

      expect(await send(input, ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.too_large' },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
      expect(gateway.pushes).toEqual([]);
    });

    it('accepts a video of exactly VIDEO_MAX_BYTES', async () => {
      const c = await givenContact();
      const keys = seedUpload('video/mp4', MP4);
      storage.sizes.set(keys.original, VIDEO_MAX_BYTES);

      expect((await send(mediaInput(c.id, 'video', 'video/mp4'), ctx)).ok).toBe(true);
    });

    it('returns upload.too_large for an image over IMAGE_MAX_BYTES', async () => {
      const c = await givenContact();
      const keys = seedUpload('image/png', PNG);
      storage.sizes.set(keys.original, IMAGE_MAX_BYTES + 1);

      expect(await send(mediaInput(c.id, 'image', 'image/png'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.too_large' },
      });
    });

    it('returns upload.too_large for a preview over PREVIEW_MAX_BYTES', async () => {
      const c = await givenContact();
      const keys = seedUpload('image/jpeg', JPEG);
      storage.sizes.set(keys.preview, PREVIEW_MAX_BYTES + 1);

      expect(await send(mediaInput(c.id, 'image', 'image/jpeg'), ctx)).toMatchObject({
        ok: false,
        error: { code: 'upload.too_large' },
      });
    });

    it('returns storage.unavailable when the storage cannot be reached', async () => {
      const c = await givenContact();
      seedUpload('image/jpeg', JPEG);
      storage.setUnavailable(true);
      const input = mediaInput(c.id, 'image', 'image/jpeg');

      expect(await send(input, ctx)).toMatchObject({
        ok: false,
        error: { code: 'storage.unavailable' },
      });
      expect(await messages.findById(input.messageId)).toBeNull();
    });
  });

  it('logs no message text, reply token, LINE user id or access token', async () => {
    const c = await givenContact({ replyToken: 'rt-secret', aiEnabled: true });
    gateway.invalidReplyTokens.add('rt-secret');
    gateway.failNext('push', 'line.unavailable');

    await send(textInput(c.id, 'private text'), ctx);

    expect(logger.entries.length).toBeGreaterThan(0);
    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain('private text');
    expect(dump).not.toContain('rt-secret');
    expect(dump).not.toContain(LINE_USER);
    expect(dump).not.toContain(FAKE_LINE_ACCESS_TOKEN);
    expect(dump).not.toContain(ctx.clientIp);
  });
});
