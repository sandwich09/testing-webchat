import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceTable, StorageKey } from '@/core/domain';
import { FakeClock, FakeFileStorage, FakeLogger } from '@/adapters/fakes';
import { makeWriteLocalUpload } from './write-local-upload.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config = { priceTable: {} as PriceTable } as UseCaseConfig;
const ctx: RequestContext = { requestId: 'req-1', clientIp: null };
const KEY = 'outbound/AAAAAAAAAAAAAAAAAAAAAA/original.jpg' as StorageKey;

const streamOf = (n: number): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(n));
      c.close();
    },
  });

describe('WriteLocalUpload', () => {
  let storage: FakeFileStorage;
  let clock: FakeClock;
  let logger: FakeLogger;
  let run: ReturnType<typeof makeWriteLocalUpload>;
  let exp: string;
  let sig: string;

  const issue = async (key: StorageKey = KEY, sizeBytes = 10) => {
    const t = await storage.issueUpload({
      key,
      contentType: 'image/jpeg',
      sizeBytes,
      expiresAt: new Date(clock.now().getTime() + 60_000),
    });
    if (!t.ok || t.value.strategy !== 'http_put') throw new Error('ticket');
    const u = new URL(t.value.url, 'http://any.origin');
    exp = u.searchParams.get('exp') ?? '';
    sig = u.searchParams.get('sig') ?? '';
  };

  beforeEach(async () => {
    storage = new FakeFileStorage();
    clock = new FakeClock();
    logger = new FakeLogger(clock);
    run = makeWriteLocalUpload({ storage, clock, logger }, config);
    await issue();
  });

  const put = (over: Partial<Parameters<typeof run>[0]> = {}, bytes = 10) =>
    run({ key: KEY, exp, sig, contentType: 'image/jpeg', body: streamOf(bytes), ...over }, ctx);

  it('writes the file for a valid signature', async () => {
    const r = await put();
    expect(r).toEqual({ ok: true, value: { sizeBytes: 10 } });
    expect(storage.files.get(KEY)?.bytes.length).toBe(10);
    expect(logger.eventsOf()).toEqual([]);
  });

  it('rejects a wrong signature and logs it', async () => {
    const r = await put({ sig: 'nope' });
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.signature_invalid' } });
    expect(storage.files.size).toBe(0);
    expect(logger.eventsOf()).toEqual(['upload.local_put.rejected']);
  });

  it('rejects an expired ticket', async () => {
    clock.advance(60_000);
    expect(await put()).toMatchObject({ ok: false, error: { code: 'upload.expired' } });
  });

  it('rejects a different Content-Type', async () => {
    const r = await put({ contentType: 'image/png' });
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.content_mismatch' } });
  });

  it('rejects a body over the signed size and leaves no file', async () => {
    const r = await put({}, 11);
    expect(r).toMatchObject({ ok: false, error: { code: 'media.too_large' } });
    expect(storage.files.size).toBe(0);
  });

  it('rejects a body shorter than the signed size (cut on the way) and leaves no file', async () => {
    const r = await put({}, 9);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.incomplete' } });
    expect(storage.files.size).toBe(0);
    expect(logger.eventsOf()).toEqual(['upload.local_put.rejected']);
  });

  it.each([
    'outbound/../AAAAAAAAAAAAAAAAAAAAAA/original.jpg',
    'inbound/AAAAAAAAAAAAAAAAAAAAAA/original.jpg',
    'outbound/short/original.jpg',
    'outbound/AAAAAAAAAAAAAAAAAAAAAA/original.gif',
    'outbound/AAAAAAAAAAAAAAAAAAAAAA/preview.png',
    'outbound/AAAAAAAAAAAAAAAAAAAAAA/original.jpg/extra',
  ])('rejects key %s without calling storage', async (key) => {
    const r = await put({ key });
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.signature_invalid' } });
    expect(logger.eventsOf()).toEqual(['upload.local_put.rejected']);
  });

  it('returns storage.unavailable when the store is down', async () => {
    storage.setUnavailable(true);
    expect(await put()).toMatchObject({ ok: false, error: { code: 'storage.unavailable' } });
  });
});
