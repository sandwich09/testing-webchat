import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BlobSdk from '@vercel/blob';
import type { StorageKey } from '@/core/domain';
import { STORAGE_CALL_TIMEOUT_MS, STORAGE_PUT_TIMEOUT_MS } from '@/core/domain';
import { describeFileStorageSuite } from '@/adapters/fakes';
import { createVercelBlobStorage } from './vercel-blob-storage.adapter';

// Only the SDK boundary is mocked. Nothing here talks to the real Vercel Blob service.
const sdk = vi.hoisted(() => ({
  put: vi.fn(),
  head: vi.fn(),
  del: vi.fn(),
  generateClientTokenFromReadWriteToken: vi.fn(),
}));

vi.mock('@vercel/blob', async (importActual) => ({
  ...(await importActual<typeof BlobSdk>()),
  put: sdk.put,
  head: sdk.head,
  del: sdk.del,
}));
vi.mock('@vercel/blob/client', () => ({
  generateClientTokenFromReadWriteToken: sdk.generateClientTokenFromReadWriteToken,
}));

const { BlobNotFoundError, BlobServiceNotAvailable } =
  await vi.importActual<typeof BlobSdk>('@vercel/blob');

const TOKEN = 'vercel_blob_rw_TEST_token';
const HOST = 'https://store123.public.blob.vercel-storage.com';
const key = (value: string): StorageKey => value as StorageKey;

interface StoredBlob {
  bytes: Uint8Array;
  contentType: string;
}

const drain = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/** In-memory stand-in for the SDK calls and the Range fetch, shared by the suite and the tests. */
const installFakeSdk = (): { blobs: Map<string, StoredBlob>; fetchMock: typeof fetch } => {
  const blobs = new Map<string, StoredBlob>();
  sdk.put.mockImplementation(
    async (pathname: string, body: ReadableStream<Uint8Array> | Uint8Array, opts) => {
      blobs.set(pathname, {
        bytes: body instanceof ReadableStream ? await drain(body) : new Uint8Array(body),
        contentType: (opts as { contentType: string }).contentType,
      });
      return { url: `${HOST}/${pathname}`, pathname };
    },
  );
  sdk.head.mockImplementation((pathname: string) => {
    const blob = blobs.get(pathname);
    if (blob === undefined) return Promise.reject(new BlobNotFoundError());
    return Promise.resolve({
      url: `${HOST}/${pathname}`,
      pathname,
      size: blob.bytes.length,
      contentType: blob.contentType,
    });
  });
  sdk.del.mockImplementation((pathname: string) => {
    blobs.delete(pathname);
    return Promise.resolve();
  });
  sdk.generateClientTokenFromReadWriteToken.mockResolvedValue('client-token-abc');
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const pathname = new URL(input instanceof Request ? input.url : input).pathname.slice(1);
    const blob = blobs.get(pathname);
    if (blob === undefined) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(new Response(blob.bytes.slice(0, 16), { status: 206 }));
  }) as unknown as typeof fetch;
  return { blobs, fetchMock };
};

describe('vercel blob storage against the FileStorage suite with a mocked SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  // Kind vercel_blob, but the "service" is the in-memory mock above: this proves the adapter's
  // mapping logic only, not the behaviour of the real Blob service.
  describeFileStorageSuite(() => {
    const { fetchMock } = installFakeSdk();
    return createVercelBlobStorage({ token: TOKEN, fetch: fetchMock });
  }, 'vercel_blob');
});

describe('vercel blob storage SDK calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a client token bound to the pathname, type, size and expiry with no random suffix', async () => {
    installFakeSdk();
    const storage = createVercelBlobStorage({ token: TOKEN });
    const expiresAt = new Date('2026-11-18T10:00:00Z');
    const result = await storage.issueUpload({
      key: key('outbound/abc/original.jpg'),
      contentType: 'image/jpeg',
      sizeBytes: 5000,
      expiresAt,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        strategy: 'vercel_blob_client',
        key: 'outbound/abc/original.jpg',
        contentType: 'image/jpeg',
        maxSizeBytes: 5000,
        pathname: 'outbound/abc/original.jpg',
        clientToken: 'client-token-abc',
      },
    });
    expect(sdk.generateClientTokenFromReadWriteToken).toHaveBeenCalledWith({
      token: TOKEN,
      pathname: 'outbound/abc/original.jpg',
      allowedContentTypes: ['image/jpeg'],
      maximumSizeInBytes: 5000,
      validUntil: expiresAt.getTime(),
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  });

  it('puts with public access, no random suffix and overwrite allowed', async () => {
    installFakeSdk();
    const storage = createVercelBlobStorage({ token: TOKEN });
    const body = new Blob([new Uint8Array(3)]).stream() as ReadableStream<Uint8Array>;
    const result = await storage.put(key('a/b.png'), body, {
      contentType: 'image/png',
      maxSizeBytes: 10,
    });
    expect(result).toEqual({ ok: true, value: { publicUrl: `${HOST}/a/b.png`, sizeBytes: 3 } });
    expect(sdk.put).toHaveBeenCalledWith('a/b.png', expect.anything(), {
      access: 'public',
      token: TOKEN,
      contentType: 'image/png',
      addRandomSuffix: false,
      allowOverwrite: true,
      abortSignal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('uploads a body of many chunks as one buffer of known length, never as a stream', async () => {
    const { blobs } = installFakeSdk();
    const storage = createVercelBlobStorage({ token: TOKEN });
    const size = 3 * 1024 * 1024;
    const chunk = 64 * 1024;
    const source = Uint8Array.from({ length: size }, (_, i) => (i * 31) % 251);
    let offset = 0;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= size) {
          controller.close();
          return;
        }
        pulls += 1;
        controller.enqueue(source.slice(offset, offset + chunk));
        offset += chunk;
      },
    });

    const result = await storage.put(key('a/photo.jpg'), body, {
      contentType: 'image/jpeg',
      maxSizeBytes: 10 * 1024 * 1024,
    });

    expect(pulls).toBe(size / chunk);
    expect(result).toEqual({
      ok: true,
      value: { publicUrl: `${HOST}/a/photo.jpg`, sizeBytes: size },
    });
    expect(sdk.put).toHaveBeenCalledTimes(1);
    const sent: unknown = sdk.put.mock.calls[0]?.[1];
    expect(sent).not.toBeInstanceOf(ReadableStream);
    expect(sent).toBeInstanceOf(Uint8Array);
    expect((sent as Uint8Array).byteLength).toBe(size);
    expect(blobs.get('a/photo.jpg')?.bytes).toEqual(source);
  });

  it('returns media.too_large and uploads nothing when the stream passes the cap', async () => {
    installFakeSdk();
    const storage = createVercelBlobStorage({ token: TOKEN });
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await storage.put(key('a/big.png'), body, {
      contentType: 'image/png',
      maxSizeBytes: 20,
    });
    expect(!result.ok && result.error.code).toBe('media.too_large');
    expect(sdk.put).not.toHaveBeenCalled();
    expect(cancelled).toBe(true); // nothing past the cap is read on
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it('fails and uploads nothing when the source errors midway', async () => {
    installFakeSdk();
    const storage = createVercelBlobStorage({ token: TOKEN });
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 2) controller.error(new Error('connection reset'));
        else controller.enqueue(new Uint8Array(64));
      },
    });
    const result = await storage.put(key('a/broken.png'), body, {
      contentType: 'image/png',
      maxSizeBytes: 1000,
    });
    expect(!result.ok && result.error.code).toBe('storage.unavailable');
    expect(sdk.put).not.toHaveBeenCalled();
  });

  it('reads the first 16 bytes with a Range request from the store host only', async () => {
    const { blobs, fetchMock } = installFakeSdk();
    blobs.set('a/b.png', {
      bytes: Uint8Array.from({ length: 40 }, (_, i) => i),
      contentType: 'image/png',
    });
    const fetchSpy = vi.fn(fetchMock);
    const storage = createVercelBlobStorage({ token: TOKEN, fetch: fetchSpy });
    const result = await storage.inspect(key('a/b.png'));
    expect(result.ok && result.value.leadingBytes).toEqual(
      Uint8Array.from({ length: 16 }, (_, i) => i),
    );
    expect(fetchSpy).toHaveBeenCalledWith(`${HOST}/a/b.png`, {
      headers: { Range: 'bytes=0-15' },
      redirect: 'error',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('keeps only the first 16 bytes when the server ignores Range and sends the whole file', async () => {
    const { blobs } = installFakeSdk();
    blobs.set('a/b.png', { bytes: new Uint8Array(40).fill(7), contentType: 'image/png' });
    const fetchFull = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array(40).fill(7), { status: 200 })),
    ) as unknown as typeof fetch;
    const storage = createVercelBlobStorage({ token: TOKEN, fetch: fetchFull });
    const result = await storage.inspect(key('a/b.png'));
    expect(result.ok && result.value.leadingBytes.length).toBe(16);
  });

  it('never fetches a URL outside the Blob public host', async () => {
    installFakeSdk();
    for (const url of [
      'https://evil.example.com/a.png',
      `http://store.public.blob.vercel-storage.com/a.png`,
      'https://public.blob.vercel-storage.com.evil.com/a.png',
      'not a url',
    ]) {
      sdk.head.mockResolvedValueOnce({ url, size: 1, contentType: 'image/png' });
      const fetchSpy = vi.fn() as unknown as typeof fetch;
      const storage = createVercelBlobStorage({ token: TOKEN, fetch: fetchSpy });
      const result = await storage.inspect(key('a/b.png'));
      expect(!result.ok && result.error.code).toBe('storage.unavailable');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  });

  it('reports a null content type when Blob returns an empty one', async () => {
    installFakeSdk();
    sdk.head.mockResolvedValueOnce({ url: `${HOST}/a.bin`, size: 3, contentType: '' });
    const fetchOk = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array(3))),
    ) as unknown as typeof fetch;
    const storage = createVercelBlobStorage({ token: TOKEN, fetch: fetchOk });
    const result = await storage.inspect(key('a.bin'));
    expect(result.ok && result.value.contentType).toBeNull();
  });
});

describe('vercel blob storage errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps SDK and network failures to storage.unavailable without leaking the message', async () => {
    installFakeSdk();
    const boom = new BlobServiceNotAvailable();
    sdk.put.mockRejectedValue(boom);
    sdk.head.mockRejectedValue(boom);
    sdk.del.mockRejectedValue(boom);
    sdk.generateClientTokenFromReadWriteToken.mockRejectedValue(new Error(`bad ${TOKEN}`));
    const storage = createVercelBlobStorage({ token: TOKEN });
    const body = () => new Blob([new Uint8Array(1)]).stream() as ReadableStream<Uint8Array>;
    const results = [
      await storage.put(key('a/b'), body(), { contentType: 'a/b', maxSizeBytes: 10 }),
      await storage.inspect(key('a/b')),
      await storage.delete(key('a/b')),
      await storage.issueUpload({
        key: key('a/b'),
        contentType: 'a/b',
        sizeBytes: 1,
        expiresAt: new Date(),
      }),
    ];
    for (const result of results) {
      expect(!result.ok && result.error.code).toBe('storage.unavailable');
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    }
  });

  it('maps a failing Range fetch to storage.unavailable', async () => {
    installFakeSdk();
    sdk.head.mockResolvedValueOnce({ url: `${HOST}/a`, size: 1, contentType: 'a/b' });
    const failing = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 500 })),
    ) as unknown as typeof fetch;
    const storage = createVercelBlobStorage({ token: TOKEN, fetch: failing });
    const result = await storage.inspect(key('a'));
    expect(!result.ok && result.error.code).toBe('storage.unavailable');
  });

  it('treats a missing blob on delete as success', async () => {
    installFakeSdk();
    sdk.del.mockRejectedValue(new BlobNotFoundError());
    const result = await createVercelBlobStorage({ token: TOKEN }).delete(key('a/b'));
    expect(result.ok).toBe(true);
  });

  it('refuses invalid keys without calling the SDK', async () => {
    installFakeSdk();
    const storage = createVercelBlobStorage({ token: TOKEN });
    const bad = key('../x');
    const body = new Blob([new Uint8Array(1)]).stream() as ReadableStream<Uint8Array>;
    expect((await storage.put(bad, body, { contentType: 'a/b', maxSizeBytes: 5 })).ok).toBe(false);
    expect(
      (
        await storage.issueUpload({
          key: bad,
          contentType: 'a/b',
          sizeBytes: 5,
          expiresAt: new Date(),
        })
      ).ok,
    ).toBe(false);
    const inspected = await storage.inspect(bad);
    expect(!inspected.ok && inspected.error.code).toBe('upload.not_found');
    expect((await storage.delete(bad)).ok).toBe(true);
    for (const fn of Object.values(sdk)) expect(fn).not.toHaveBeenCalled();
  });

  it('rejects an empty token', () => {
    expect(() => createVercelBlobStorage({ token: '' })).toThrow();
  });
});

describe('vercel blob storage deadlines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

  it('fails a put that never settles after STORAGE_PUT_TIMEOUT_MS and aborts it', async () => {
    installFakeSdk();
    let signal: AbortSignal | undefined;
    let started: () => void = () => undefined;
    const uploadStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    sdk.put.mockImplementation((_p: string, _b: unknown, opts: { abortSignal: AbortSignal }) => {
      signal = opts.abortSignal;
      started();
      return never();
    });
    const storage = createVercelBlobStorage({ token: TOKEN });
    let settled = false;
    const pending = storage
      .put(key('a/b.jpg'), new Blob([new Uint8Array(10)]).stream(), {
        contentType: 'image/jpeg',
        maxSizeBytes: 100,
      })
      .finally(() => {
        settled = true;
      });

    // The source is read with real stream I/O before the deadline timer is set, so the clock is
    // moved only once the upload has started (the timer is set just before the SDK is called).
    // Moving it earlier leaves the timer unset on a slow machine and the test waits forever.
    // A plain promise is awaited, not vi.waitFor, which would move the fake clock itself.
    await uploadStarted;
    await vi.advanceTimersByTimeAsync(STORAGE_PUT_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(!result.ok && result.error.code).toBe('storage.unavailable');
    expect(signal?.aborted).toBe(true);
  });

  it('fails an inspect and a delete that never settle after STORAGE_CALL_TIMEOUT_MS', async () => {
    installFakeSdk();
    const signals: AbortSignal[] = [];
    const hang = (_p: string, opts: { abortSignal: AbortSignal }) => {
      signals.push(opts.abortSignal);
      return never();
    };
    sdk.head.mockImplementation(hang);
    sdk.del.mockImplementation(hang);
    const storage = createVercelBlobStorage({ token: TOKEN });
    const inspected = storage.inspect(key('a/b.jpg'));
    const deleted = storage.delete(key('a/b.jpg'));

    await vi.advanceTimersByTimeAsync(STORAGE_CALL_TIMEOUT_MS);

    const [i, d] = await Promise.all([inspected, deleted]);
    expect(!i.ok && i.error.code).toBe('storage.unavailable');
    expect(!d.ok && d.error.code).toBe('storage.unavailable');
    expect(signals.map((x) => x.aborted)).toEqual([true, true]);
  });

  it('bounds the Range read of inspect by the same deadline', async () => {
    installFakeSdk();
    sdk.head.mockResolvedValueOnce({ url: `${HOST}/a`, size: 1, contentType: 'a/b' });
    const stalled = vi.fn(() =>
      Promise.resolve(new Response(new ReadableStream<Uint8Array>(), { status: 206 })),
    ) as unknown as typeof fetch;
    const storage = createVercelBlobStorage({ token: TOKEN, fetch: stalled });
    const inspected = storage.inspect(key('a'));

    await vi.advanceTimersByTimeAsync(STORAGE_CALL_TIMEOUT_MS);

    const result = await inspected;
    expect(!result.ok && result.error.code).toBe('storage.unavailable');
  });
});
