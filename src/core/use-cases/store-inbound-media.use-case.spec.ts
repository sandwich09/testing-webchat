import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContactId,
  LineMessageId,
  LineUserId,
  Message,
  MessageId,
  PriceTable,
} from '@/core/domain';
import {
  AUDIO_MAX_BYTES,
  IMAGE_MAX_BYTES,
  MEDIA_CONTENT_CALL_WORST_MS,
  MEDIA_JOB_BUDGET_MS,
  MEDIA_NOT_READY_POLL_MS,
  MEDIA_STORE_CALL_WORST_MS,
  PREVIEW_MAX_BYTES,
  err,
  ok,
} from '@/core/domain';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FakeClock,
  FakeContactRepository,
  FakeFileStorage,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeSecretCipher,
  FakeSettingsRepository,
} from '@/adapters/fakes';
import { makeStoreInboundMedia } from './store-inbound-media.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.test',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 0,
  rateLimitScale: 1,
  priceTable: {} as PriceTable, // cast: not used by this use case
};
const ctx: RequestContext = { requestId: 'job-1', clientIp: null };

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(60).fill(7)]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, ...ascii('ftypisom'), ...Array<number>(40).fill(1)]);
const PREVIEW_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 9, 9, 9]);
const NOT_AN_IMAGE = Uint8Array.from(ascii('<html>hello</html>'));

const erroringStream = (error: unknown): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]));
      controller.error(error);
    },
  });

/** Reads the whole body so a storage stand-in behaves like an adapter that saw a source error. */
const drain = async (body: ReadableStream<Uint8Array>): Promise<void> => {
  const reader = body.getReader();
  try {
    for (;;) if ((await reader.read()).done) return;
  } catch {
    // the source errored, as the test intends
  }
};

describe('StoreInboundMedia', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let logger: FakeLogger;
  let cipher: FakeSecretCipher;
  let settings: FakeSettingsRepository;
  let gateway: FakeMessagingGateway;
  let storage: FakeFileStorage;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let contactId: ContactId;
  let run: ReturnType<typeof makeStoreInboundMedia>;
  let n = 0;

  const insertMedia = async (
    type: 'image' | 'video' | 'audio' | 'text',
    o: { mediaStatus?: Message['mediaStatus']; lineMessageId?: string | null } = {},
  ): Promise<Message> => {
    const lineMessageId = o.lineMessageId === undefined ? `lm-${String(++n)}` : o.lineMessageId;
    const { message } = await messages.insertInboundIfAbsent({
      id: ids.messageId(),
      contactId,
      direction: 'inbound',
      author: 'customer',
      type,
      text: type === 'text' ? 'hi' : null,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: type === 'text' ? null : (o.mediaStatus ?? 'pending'),
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: null,
      lineMessageId: lineMessageId as LineMessageId | null, // brand: test id
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: clock.now(),
      sentAt: null,
    });
    return message;
  };

  const reload = async (id: MessageId): Promise<Message> => {
    const m = await messages.findById(id);
    if (m === null) throw new Error('message missing');
    return m;
  };

  const lineIdOf = (m: Message): LineMessageId => {
    if (m.lineMessageId === null) throw new Error('no line id');
    return m.lineMessageId;
  };

  const storedKeys = (): string[] => [...storage.files.keys()];

  beforeEach(async () => {
    clock = new FakeClock();
    ids = new FakeIdGenerator(clock);
    logger = new FakeLogger(clock);
    cipher = new FakeSecretCipher();
    settings = new FakeSettingsRepository();
    gateway = new FakeMessagingGateway();
    storage = new FakeFileStorage();
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'Shop', basicId: '@shop' },
      { channelId: '1000000001', secretVerifiedAt: null },
    );
    ({
      contact: { id: contactId },
    } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: 'U-media' as LineUserId, // brand: test id
      now: clock.now(),
    }));
    run = makeStoreInboundMedia(
      { messages, contacts, settings, cipher, gateway, storage, ids, clock, logger },
      config,
    );
  });

  it('stores a normal JPEG as ready with previewUrl equal to mediaUrl under a random inbound/ key', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });

    const result = await run({ messageId: m.id }, ctx);

    expect(result).toEqual(ok({ status: 'ready' }));
    const after = await reload(m.id);
    expect(after.mediaStatus).toBe('ready');
    expect(after.previewUrl).toBe(after.mediaUrl);
    const [key] = storedKeys();
    expect(storedKeys()).toHaveLength(1);
    expect(key).toMatch(/^inbound\/[A-Za-z0-9_-]{22}\/original\.jpg$/);
    expect(after.mediaUrl).toContain(key);
    expect(storage.files.get(key ?? '')?.bytes).toEqual(JPEG);
    expect(storage.files.get(key ?? '')?.contentType).toBe('image/jpeg');
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        event: 'media.store.succeeded',
        messageId: m.id,
        sizeBytes: JPEG.length,
      }),
    );
  });

  describe('content LINE has not finished preparing (202)', () => {
    const video = { original: MP4, preview: PREVIEW_JPEG, contentType: 'video/mp4' };

    it('stays pending while it waits, then stores the video once LINE says it is ready', async () => {
      const m = await insertMedia('video');
      gateway.setContent(lineIdOf(m), { ...video, notReadyTimes: 3 });
      const seen: (string | null)[] = [];
      const sleep = clock.sleep.bind(clock);
      vi.spyOn(clock, 'sleep').mockImplementation(async (ms) => {
        seen.push((await reload(m.id)).mediaStatus);
        await sleep(ms);
      });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

      expect(seen).toEqual(['pending', 'pending', 'pending']);
      expect(clock.sleeps).toEqual([
        MEDIA_NOT_READY_POLL_MS,
        MEDIA_NOT_READY_POLL_MS,
        MEDIA_NOT_READY_POLL_MS,
      ]);
      expect((await reload(m.id)).mediaStatus).toBe('ready');
      expect(logger.entries.filter((e) => e.event === 'media.store.not_ready')).toEqual([
        expect.objectContaining({ messageId: m.id, attempt: 1 }),
        expect.objectContaining({ messageId: m.id, attempt: 2 }),
        expect.objectContaining({ messageId: m.id, attempt: 3 }),
      ]);
    });

    it('fails with line.content_not_ready when it is still not ready within MEDIA_JOB_BUDGET_MS', async () => {
      const m = await insertMedia('video');
      gateway.setContent(lineIdOf(m), { ...video, notReadyTimes: 1000 });
      const started = clock.now().getTime();

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

      // Every wait left room for the worst case of what came after it: the original once more
      // and its store (a video's preview is only fetched when the budget still holds it).
      expect(
        clock.now().getTime() - started + MEDIA_CONTENT_CALL_WORST_MS + MEDIA_STORE_CALL_WORST_MS,
      ).toBeLessThanOrEqual(MEDIA_JOB_BUDGET_MS);
      expect(clock.sleeps.length).toBeGreaterThan(0);
      expect((await reload(m.id)).mediaStatus).toBe('failed');
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'media.store.failed',
          errorCode: 'line.content_not_ready',
        }),
      );
      expect(storedKeys()).toEqual([]);
    });

    it('does not wait when the first download already used the budget, and fails at once', async () => {
      const m = await insertMedia('video');
      gateway.setContent(lineIdOf(m), { ...video, notReadyTimes: 1 });
      const download = gateway.downloadContent.bind(gateway);
      vi.spyOn(gateway, 'downloadContent').mockImplementationOnce(async (...args) => {
        clock.advance(MEDIA_CONTENT_CALL_WORST_MS); // a download that took its worst case
        return download(...args);
      });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

      expect(clock.sleeps).toEqual([]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'media.store.failed',
          errorCode: 'line.content_not_ready',
        }),
      );
    });

    it('fails with line.content_unavailable when LINE says the preparation failed', async () => {
      const m = await insertMedia('video');
      gateway.setContent(lineIdOf(m), { ...video, transcodingFailed: true });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

      expect(clock.sleeps).toEqual([MEDIA_NOT_READY_POLL_MS]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'media.store.failed',
          errorCode: 'line.content_unavailable',
        }),
      );
    });

    it('keeps asking while the status call fails, and stores the image when it is ready', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), {
        original: JPEG,
        contentType: 'image/jpeg',
        notReadyTimes: 1,
      });
      gateway.failNext('getContentStatus', 'line.unavailable');

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));
      expect(clock.sleeps).toEqual([MEDIA_NOT_READY_POLL_MS, MEDIA_NOT_READY_POLL_MS]);
    });
  });

  describe('stages and the job deadline', () => {
    const stalledStream = (): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } => {
      let cancelled = false;
      let sent = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(JPEG.slice(0, 8));
          }
          // then no chunk ever again
          return new Promise<void>(() => undefined);
        },
        cancel() {
          cancelled = true;
        },
      });
      return { stream, cancelled: () => cancelled };
    };

    const events = (): string[] =>
      logger.entries.map((e) => e.event).filter((e) => e.startsWith('media.store.'));

    const logged = async (event: string): Promise<void> => {
      await vi.waitFor(() => {
        expect(events()).toContain(event);
      });
    };

    it('logs started, downloaded and uploaded with the byte counts before succeeded', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

      expect(events()).toEqual([
        'media.store.started',
        'media.store.downloaded',
        'media.store.uploaded',
        'media.store.succeeded',
      ]);
      const byEvent = (event: string) => logger.entries.find((e) => e.event === event);
      expect(byEvent('media.store.started')).toMatchObject({ messageId: m.id, requestId: 'job-1' });
      expect(byEvent('media.store.downloaded')).toMatchObject({ sizeBytes: JPEG.length });
      expect(byEvent('media.store.uploaded')).toMatchObject({ sizeBytes: JPEG.length });
      expect(byEvent('media.store.succeeded')).toMatchObject({ durationMs: 0 });
      expect(clock.pendingTimers).toBe(0); // the deadline timer is cleared
    });

    it('names the stage of a failure', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
      storage.setUnavailable(true);

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'media.store.failed',
          errorCode: 'storage.unavailable',
          stage: 'upload',
          outcome: 'failed',
        }),
      );
    });

    it('marks failed (interrupted) at MEDIA_JOB_BUDGET_MS when the LINE body stalls, with stage download', async () => {
      const m = await insertMedia('image');
      const stalled = stalledStream();
      vi.spyOn(gateway, 'downloadContent').mockResolvedValue(
        ok({ stream: stalled.stream, contentType: 'image/jpeg', sizeBytes: null }),
      );
      const started = clock.now().getTime();

      const pending = run({ messageId: m.id }, ctx);
      await logged('media.store.started');
      clock.advance(MEDIA_JOB_BUDGET_MS - 1);
      await Promise.resolve();
      expect((await reload(m.id)).mediaStatus).toBe('pending');
      clock.advance(1);

      expect(await pending).toEqual(ok({ status: 'failed' }));
      expect(clock.now().getTime() - started).toBe(MEDIA_JOB_BUDGET_MS);
      const after = await reload(m.id);
      expect(after.mediaStatus).toBe('failed');
      expect(after.mediaFailure).toBe('interrupted');
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'media.store.failed',
          outcome: 'deadline',
          stage: 'download',
          durationMs: MEDIA_JOB_BUDGET_MS,
        }),
      );
      expect(events()).not.toContain('media.store.downloaded');
      await vi.waitFor(() => {
        expect(stalled.cancelled()).toBe(true); // the LINE stream is let go
      });
    });

    it('marks failed (interrupted) at MEDIA_JOB_BUDGET_MS when the storage put never settles, with stage upload', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
      vi.spyOn(storage, 'put').mockImplementation(async (_key, body) => {
        await drain(body); // the download ends, then the upload hangs
        return new Promise(() => undefined);
      });

      const pending = run({ messageId: m.id }, ctx);
      await logged('media.store.downloaded');
      clock.advance(MEDIA_JOB_BUDGET_MS);

      expect(await pending).toEqual(ok({ status: 'failed' }));
      expect((await reload(m.id)).mediaFailure).toBe('interrupted');
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'media.store.failed',
          outcome: 'deadline',
          stage: 'upload',
        }),
      );
    });

    it('keeps the failed status when the abandoned step ends after the deadline', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
      let release: (() => void) | undefined;
      const put = storage.put.bind(storage);
      vi.spyOn(storage, 'put').mockImplementation(async (...args) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return put(...args);
      });

      const pending = run({ messageId: m.id }, ctx);
      await vi.waitFor(() => {
        expect(release).toBeDefined();
      });
      clock.advance(MEDIA_JOB_BUDGET_MS);
      expect(await pending).toEqual(ok({ status: 'failed' }));

      release?.();
      await vi.waitFor(() => {
        expect(storedKeys()).toEqual([]); // the late file is dropped
      });
      expect((await reload(m.id)).mediaStatus).toBe('failed');
      expect(events().filter((e) => e === 'media.store.succeeded')).toEqual([]);
    });

    it('skips the video preview when the budget left cannot hold it', async () => {
      const m = await insertMedia('video');
      gateway.setContent(lineIdOf(m), {
        original: MP4,
        preview: PREVIEW_JPEG,
        contentType: 'video/mp4',
      });
      const download = gateway.downloadContent.bind(gateway);
      const spy = vi.spyOn(gateway, 'downloadContent').mockImplementationOnce(async (...args) => {
        clock.advance(MEDIA_CONTENT_CALL_WORST_MS); // the original took its worst case
        return download(...args);
      });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

      const after = await reload(m.id);
      expect(after.previewUrl).toBe(after.mediaUrl);
      expect(spy).toHaveBeenCalledTimes(1); // no preview download
    });
  });

  it('uses a different random key for every message', async () => {
    const a = await insertMedia('image');
    const b = await insertMedia('image');
    gateway.setContent(lineIdOf(a), { original: JPEG, contentType: 'image/jpeg' });
    gateway.setContent(lineIdOf(b), { original: JPEG, contentType: 'image/jpeg' });

    await run({ messageId: a.id }, ctx);
    await run({ messageId: b.id }, ctx);

    expect(new Set(storedKeys()).size).toBe(2);
  });

  it('accepts PNG content in an image message although the key ends in .jpg', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: PNG, contentType: null });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));
    expect(storage.files.get(storedKeys()[0] ?? '')?.contentType).toBe('application/octet-stream');
  });

  describe('audio', () => {
    const ascii = (t: string) => Array.from(t, (c) => c.charCodeAt(0));
    const M4A = new Uint8Array([0, 0, 0, 0x1c, ...ascii('ftypM4A '), 0, 0, 2, 0, 1, 2, 3, 4]);
    const MP3 = new Uint8Array([...ascii('ID3'), 4, 0, 0, 0, 0, 0, 0, 9, 9]);
    const ADTS = new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0, 0x1f, 0xfc, 5, 5]);

    it.each([
      ['M4A', M4A, 'audio/x-m4a', 'm4a', 'audio/mp4'],
      ['MP3', MP3, 'audio/mpeg', 'mp3', 'audio/mpeg'],
      ['AAC ADTS', ADTS, 'application/octet-stream', 'aac', 'audio/aac'],
    ] as const)(
      'stores %s with the extension and Content-Type read from its bytes, no preview download',
      async (_name, bytes, lineType, ext, stored) => {
        const m = await insertMedia('audio');
        gateway.setContent(lineIdOf(m), { original: bytes, contentType: lineType });
        const download = vi.spyOn(gateway, 'downloadContent');

        expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

        const after = await reload(m.id);
        const [key] = storedKeys();
        expect(key).toMatch(new RegExp(`^inbound/[A-Za-z0-9_-]{22}/original\\.${ext}$`));
        expect(storage.files.get(key ?? '')?.bytes).toEqual(bytes);
        expect(storage.files.get(key ?? '')?.contentType).toBe(stored);
        expect(after.previewUrl).toBe(after.mediaUrl);
        expect(download).toHaveBeenCalledTimes(1);
        expect(download).toHaveBeenCalledWith(
          FAKE_LINE_ACCESS_TOKEN,
          m.lineMessageId,
          'original',
          AUDIO_MAX_BYTES,
        );
      },
    );

    it('fails and stores nothing when the bytes are not an accepted audio container', async () => {
      const m = await insertMedia('audio');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'audio/x-m4a' });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
      expect(storedKeys()).toEqual([]);
      expect(await reload(m.id)).toMatchObject({
        mediaStatus: 'failed',
        mediaFailure: 'unsupported_type',
      });
    });

    it('marks too_large when LINE reports a size over AUDIO_MAX_BYTES', async () => {
      const m = await insertMedia('audio');
      const big = new Uint8Array(AUDIO_MAX_BYTES + 1);
      big.set(M4A);
      gateway.setContent(lineIdOf(m), { original: big, contentType: 'audio/x-m4a' });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'too_large' }));
    });
  });

  it('stores an MP4 as ready with a separate preview image', async () => {
    const m = await insertMedia('video');
    gateway.setContent(lineIdOf(m), {
      original: MP4,
      preview: PREVIEW_JPEG,
      contentType: 'video/mp4',
    });
    const download = vi.spyOn(gateway, 'downloadContent');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

    const after = await reload(m.id);
    expect(after.mediaUrl).toMatch(/\/inbound\/[^/]+\/original\.mp4$/);
    expect(after.previewUrl).toMatch(/\/inbound\/[^/]+\/preview\.jpg$/);
    expect(after.previewUrl).not.toBe(after.mediaUrl);
    expect(storedKeys()).toHaveLength(2);
    expect(download).toHaveBeenLastCalledWith(
      FAKE_LINE_ACCESS_TOKEN,
      m.lineMessageId,
      'preview',
      PREVIEW_MAX_BYTES,
    );
  });

  it('stores a video as ready with previewUrl equal to mediaUrl when the preview cannot be fetched', async () => {
    const m = await insertMedia('video');
    gateway.setContent(lineIdOf(m), { original: MP4, contentType: 'video/mp4' });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

    const after = await reload(m.id);
    expect(after.mediaStatus).toBe('ready');
    expect(after.previewUrl).toBe(after.mediaUrl);
  });

  it('falls back to mediaUrl when the unsized preview stream passes PREVIEW_MAX_BYTES', async () => {
    const m = await insertMedia('video');
    gateway.setContent(lineIdOf(m), {
      original: MP4,
      preview: new Uint8Array(PREVIEW_MAX_BYTES + 1),
      contentType: 'video/mp4',
      knownSize: false,
    });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

    const after = await reload(m.id);
    expect(after.previewUrl).toBe(after.mediaUrl);
    expect(storedKeys()).toHaveLength(1);
  });

  it('falls back to mediaUrl when the preview download throws', async () => {
    const m = await insertMedia('video');
    gateway.setContent(lineIdOf(m), { original: MP4, preview: PREVIEW_JPEG, contentType: null });
    const real = gateway.downloadContent.bind(gateway);
    vi.spyOn(gateway, 'downloadContent').mockImplementation((token, id, variant, max) =>
      variant === 'preview' ? Promise.reject(new Error('socket')) : real(token, id, variant, max),
    );

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));
    const after = await reload(m.id);
    expect(after.previewUrl).toBe(after.mediaUrl);
  });

  it('marks too_large without calling put when LINE reports a size over IMAGE_MAX_BYTES', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), {
      original: new Uint8Array(IMAGE_MAX_BYTES + 1),
      contentType: 'image/jpeg',
    });
    const put = vi.spyOn(storage, 'put');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'too_large' }));

    expect((await reload(m.id)).mediaStatus).toBe('too_large');
    expect(put).not.toHaveBeenCalled();
    expect(storedKeys()).toEqual([]);
  });

  it('marks too_large and leaves no file when an unsized stream passes the cap', async () => {
    const m = await insertMedia('image');
    const big = new Uint8Array(IMAGE_MAX_BYTES + 1);
    big.set(JPEG);
    gateway.setContent(lineIdOf(m), { original: big, contentType: 'image/jpeg', knownSize: false });
    const del = vi.spyOn(storage, 'delete');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'too_large' }));

    expect((await reload(m.id)).mediaStatus).toBe('too_large');
    expect(storedKeys()).toEqual([]);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('marks too_large when the stream carries the cap error and storage reports it as unavailable', async () => {
    const m = await insertMedia('image');
    const capError = Object.assign(new Error('over cap'), { code: 'media.too_large' });
    vi.spyOn(gateway, 'downloadContent').mockResolvedValue(
      ok({ stream: erroringStream(capError), contentType: 'image/jpeg', sizeBytes: 10 }),
    );
    vi.spyOn(storage, 'put').mockImplementation(async (_key, body) => {
      await drain(body);
      return err('storage.unavailable');
    });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'too_large' }));
    expect((await reload(m.id)).mediaStatus).toBe('too_large');
  });

  it('marks failed when a sized stream breaks for another reason', async () => {
    const m = await insertMedia('image');
    vi.spyOn(gateway, 'downloadContent').mockResolvedValue(
      ok({ stream: erroringStream(new Error('reset')), contentType: 'image/jpeg', sizeBytes: 10 }),
    );

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect((await reload(m.id)).mediaStatus).toBe('failed');
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ event: 'media.store.failed', errorCode: 'line.unavailable' }),
    );
  });

  it('marks failed, not too_large, when an unsized stream breaks without the cap code', async () => {
    const m = await insertMedia('image');
    vi.spyOn(gateway, 'downloadContent').mockResolvedValue(
      ok({
        stream: erroringStream(new Error('reset')),
        contentType: 'image/jpeg',
        sizeBytes: null,
      }),
    );

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect((await reload(m.id)).mediaStatus).toBe('failed');
    expect(storedKeys()).toEqual([]);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ event: 'media.store.failed', errorCode: 'line.unavailable' }),
    );
  });

  it('marks too_large when a stream with a Content-Length over the cap breaks', async () => {
    const m = await insertMedia('image');
    vi.spyOn(gateway, 'downloadContent').mockResolvedValue(
      ok({
        stream: erroringStream(new Error('reset')),
        contentType: 'image/jpeg',
        sizeBytes: IMAGE_MAX_BYTES + 1,
      }),
    );

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'too_large' }));
  });

  it('marks too_large when storage stops reading a stream that LINE did not cap', async () => {
    const m = await insertMedia('image');
    const big = new Uint8Array(IMAGE_MAX_BYTES + 1);
    big.set(JPEG);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(big);
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.spyOn(gateway, 'downloadContent').mockResolvedValue(
      ok({ stream, contentType: 'image/jpeg', sizeBytes: null }),
    );
    const del = vi.spyOn(storage, 'delete');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'too_large' }));
    expect(cancelled).toBe(true); // the cancel reaches the LINE stream
    expect(del).toHaveBeenCalledTimes(1);
    expect(storedKeys()).toEqual([]);
  });

  it('still marks failed when deleting the rejected file throws', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: NOT_AN_IMAGE, contentType: 'image/jpeg' });
    vi.spyOn(storage, 'delete').mockRejectedValue(new Error('gone'));

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect((await reload(m.id)).mediaStatus).toBe('failed');
  });

  it('marks failed when LINE answers 404 because the content expired', async () => {
    const m = await insertMedia('image');
    gateway.failNext('downloadContent', 'line.content_unavailable');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

    expect(await reload(m.id)).toMatchObject({
      mediaStatus: 'failed',
      mediaFailure: 'download_failed',
    });
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        event: 'media.store.failed',
        messageId: m.id,
        errorCode: 'line.content_unavailable',
      }),
    );
  });

  it('marks failed and deletes the file when the content is not an image although the header says so', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: NOT_AN_IMAGE, contentType: 'image/jpeg' });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

    const after = await reload(m.id);
    expect(after.mediaStatus).toBe('failed');
    expect(after.mediaFailure).toBe('unsupported_type');
    expect(after.mediaUrl).toBeNull();
    expect(storedKeys()).toEqual([]);
  });

  it('marks failed when a video message holds image content', async () => {
    const m = await insertMedia('video');
    gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'video/mp4' });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect(storedKeys()).toEqual([]);
  });

  it('marks failed and drops the file when the stored file cannot be inspected', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
    vi.spyOn(storage, 'inspect').mockResolvedValue(err('storage.unavailable'));

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect(storedKeys()).toEqual([]);
  });

  it('marks failed when file storage is down', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
    storage.setUnavailable(true);

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect((await reload(m.id)).mediaStatus).toBe('failed');
  });

  it('does not download again for a message that is already ready', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
    await run({ messageId: m.id }, ctx);
    const download = vi.spyOn(gateway, 'downloadContent');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));
    expect(download).not.toHaveBeenCalled();
    expect(storedKeys()).toHaveLength(1);
  });

  describe('two runs for the same message', () => {
    it('ends ready with one stored file when two runs race', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });

      const results = await Promise.all([
        run({ messageId: m.id }, ctx),
        run({ messageId: m.id }, ctx),
      ]);

      expect(results).toEqual([ok({ status: 'ready' }), ok({ status: 'ready' })]);
      const after = await reload(m.id);
      expect(after.mediaStatus).toBe('ready');
      const [key] = storedKeys();
      expect(storedKeys()).toHaveLength(1);
      expect(after.mediaUrl).toContain(key);
      expect(logger.eventsOf()).toContain('media.store.succeeded');
    });

    it('keeps the first result and drops its own files when a late run also stores the video', async () => {
      const m = await insertMedia('video');
      gateway.setContent(lineIdOf(m), {
        original: MP4,
        preview: PREVIEW_JPEG,
        contentType: 'video/mp4',
      });
      await run({ messageId: m.id }, ctx);
      const first = await reload(m.id);
      // The late run read the row while it was still pending.
      vi.spyOn(messages, 'findById').mockResolvedValueOnce({ ...first, mediaStatus: 'pending' });

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

      const after = await reload(m.id);
      expect(after.mediaUrl).toBe(first.mediaUrl);
      expect(after.previewUrl).toBe(first.previewUrl);
      expect(after.updatedSeq).toBe(first.updatedSeq);
      expect(storedKeys()).toHaveLength(2);
      expect(logger.eventsOf().filter((e) => e === 'media.store.succeeded')).toHaveLength(1);
    });

    it('does not turn a ready message into failed when a late run fails', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
      await run({ messageId: m.id }, ctx);
      const first = await reload(m.id);
      vi.spyOn(messages, 'findById').mockResolvedValueOnce({ ...first, mediaStatus: 'pending' });
      gateway.failNext('downloadContent', 'line.unavailable');

      expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'ready' }));

      expect(await reload(m.id)).toEqual(first);
      expect(logger.eventsOf()).not.toContain('media.store.failed');
    });

    it('does not turn a ready message into failed when a late run throws', async () => {
      const m = await insertMedia('image');
      gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
      await run({ messageId: m.id }, ctx);
      const first = await reload(m.id);
      vi.spyOn(messages, 'findById').mockResolvedValueOnce({ ...first, mediaStatus: 'pending' });
      vi.spyOn(gateway, 'downloadContent').mockRejectedValueOnce(new Error('socket'));

      await expect(run({ messageId: m.id }, ctx)).rejects.toThrow('socket');
      expect(await reload(m.id)).toEqual(first);
    });
  });

  it('marks failed when the LINE credentials are missing', async () => {
    settings = new FakeSettingsRepository();
    run = makeStoreInboundMedia(
      { messages, contacts, settings, cipher, gateway, storage, ids, clock, logger },
      config,
    );
    const m = await insertMedia('image');
    const download = vi.spyOn(gateway, 'downloadContent');

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));

    expect((await reload(m.id)).mediaStatus).toBe('failed');
    expect(download).not.toHaveBeenCalled();
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ event: 'media.store.failed', errorCode: 'line.not_configured' }),
    );
  });

  it('returns at once for a missing message, a non-media message and media from an external URL', async () => {
    const download = vi.spyOn(gateway, 'downloadContent');
    const text = await insertMedia('text');
    const external = await insertMedia('image', { mediaStatus: 'failed' });

    const missing = 'missing' as MessageId; // brand: test id
    expect(await run({ messageId: missing }, ctx)).toEqual(ok({ status: 'failed' }));
    expect(await run({ messageId: text.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect(await run({ messageId: external.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect(download).not.toHaveBeenCalled();
    expect((await reload(text.id)).mediaStatus).toBeNull();
  });

  it('marks failed when the message has no LINE message id', async () => {
    const m = await insertMedia('image', { lineMessageId: null });

    expect(await run({ messageId: m.id }, ctx)).toEqual(ok({ status: 'failed' }));
    expect((await reload(m.id)).mediaStatus).toBe('failed');
  });

  it('marks failed and rethrows when something throws unexpectedly', async () => {
    const m = await insertMedia('image');
    gateway.setContent(lineIdOf(m), { original: JPEG, contentType: 'image/jpeg' });
    vi.spyOn(storage, 'put').mockRejectedValue(new Error('disk exploded'));

    await expect(run({ messageId: m.id }, ctx)).rejects.toThrow('disk exploded');
    expect((await reload(m.id)).mediaStatus).toBe('failed');
  });

  it('rethrows the original error even when marking failed also throws', async () => {
    const m = await insertMedia('image');
    vi.spyOn(gateway, 'downloadContent').mockRejectedValue(new Error('first'));
    vi.spyOn(messages, 'setMediaStatus').mockRejectedValue(new Error('second'));

    await expect(run({ messageId: m.id }, ctx)).rejects.toThrow('first');
  });

  it('never logs the access token', async () => {
    const m = await insertMedia('image');
    gateway.failNext('downloadContent', 'line.unauthorized');

    await run({ messageId: m.id }, ctx);

    expect(JSON.stringify(logger.entries)).not.toContain(FAKE_LINE_ACCESS_TOKEN);
    expect(logger.entries.length).toBeGreaterThan(0);
  });
});
