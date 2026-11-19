import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StorageKey } from '@/core/domain';
import type { FileStorage } from '@/core/ports';
import { FakeClock, describeFileStorageSuite } from '@/adapters/fakes';
import { createLocalFileStorage, isValidLocalStorageKey } from './local-file-storage.adapter';

const BASE_URL = 'http://localhost:3000';
const SECRET = 'test-secret-for-local-storage';
const NOW = new Date('2026-11-18T09:00:00Z');
const EXPIRES_AT = new Date('2026-11-18T10:00:00Z');

let tempRoot: string;
let counter = 0;

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'webchat-local-storage-'));
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

const freshRoot = (): string => join(tempRoot, `root-${String(++counter)}`);

const make = (rootDir = freshRoot(), secret = SECRET): FileStorage =>
  createLocalFileStorage({ rootDir, baseUrl: `${BASE_URL}/`, secret, clock: new FakeClock(NOW) });

const toStream = (bytes: Uint8Array, chunkSize = 4): ReadableStream<Uint8Array> => {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
};

const key = (value: string): StorageKey => value as StorageKey;

describeFileStorageSuite(() => make(), 'local_disk');

describe('local file storage keys', () => {
  it.each(['outbound/abc_-123/original.png', 'inbound/tok/preview.jpg', 'suite/1-2/file.bin', 'a'])(
    'accepts %s',
    (value) => {
      expect(isValidLocalStorageKey(value)).toBe(true);
    },
  );

  it.each([
    '',
    '../etc/passwd',
    'a/../b',
    'a/./b',
    '/etc/passwd',
    'a//b',
    'a/',
    '.hidden',
    'a/.hidden',
    'a\\b',
    'a\0b',
    'a b',
    'a/%2e%2e/b',
    'C:/x',
    `a/${'b'.repeat(600)}`,
  ])('rejects %j', (value) => {
    expect(isValidLocalStorageKey(value)).toBe(false);
  });

  it('refuses traversal on every method and touches nothing outside the root', async () => {
    const root = freshRoot();
    const outside = join(tempRoot, 'outside.txt');
    await writeFile(outside, 'secret');
    const storage = make(root);
    const bad = key('../outside.txt');
    const body = () => toStream(Uint8Array.from([1, 2, 3]));
    expect((await storage.put(bad, body(), { contentType: 'a/b', maxSizeBytes: 10 })).ok).toBe(
      false,
    );
    const inspect = await storage.inspect(bad);
    expect(!inspect.ok && inspect.error.code).toBe('upload.not_found');
    const read = await storage.read(bad);
    expect(!read.ok && read.error.code).toBe('media.not_found');
    expect(
      (
        await storage.issueUpload({
          key: bad,
          contentType: 'a/b',
          maxSizeBytes: 1,
          expiresAt: EXPIRES_AT,
        })
      ).ok,
    ).toBe(false);
    const accept = await storage.acceptSignedPut(
      bad,
      { exp: '1', sig: '1.YS9i.x' },
      'a/b',
      body(),
      NOW,
    );
    expect(!accept.ok && accept.error.code).toBe('upload.signature_invalid');
    expect((await storage.delete(bad)).ok).toBe(true);
    expect(await readFile(outside, 'utf8')).toBe('secret');
  });
});

describe('local file storage signed PUT', () => {
  const issue = async (
    storage: FileStorage,
    opts: { maxSizeBytes?: number; contentType?: string; k?: StorageKey } = {},
  ) => {
    const k = opts.k ?? key('outbound/abc/original.png');
    const issued = await storage.issueUpload({
      key: k,
      contentType: opts.contentType ?? 'image/png',
      maxSizeBytes: opts.maxSizeBytes ?? 100,
      expiresAt: EXPIRES_AT,
    });
    if (!issued.ok || issued.value.strategy !== 'http_put') throw new Error('expected http_put');
    return { k, url: new URL(issued.value.url), target: issued.value };
  };

  it('builds a URL under /api/local-storage with exp in seconds and a sig that carries size and type', async () => {
    const { url, target } = await issue(make(), { maxSizeBytes: 1234 });
    expect(url.origin + url.pathname).toBe(
      `${BASE_URL}/api/local-storage/outbound/abc/original.png`,
    );
    expect(url.searchParams.get('exp')).toBe(String(EXPIRES_AT.getTime() / 1000));
    const parts = (url.searchParams.get('sig') ?? '').split('.');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('1234');
    expect(Buffer.from(parts[1] ?? '', 'base64url').toString()).toBe('image/png');
    expect(target.headers).toEqual({ 'Content-Type': 'image/png' });
  });

  const accept = (
    storage: FileStorage,
    k: StorageKey,
    url: URL,
    overrides: { sig?: string; exp?: string; type?: string; now?: Date; size?: number } = {},
  ) =>
    storage.acceptSignedPut(
      k,
      {
        exp: overrides.exp ?? url.searchParams.get('exp') ?? '',
        sig: overrides.sig ?? url.searchParams.get('sig') ?? '',
      },
      overrides.type ?? 'image/png',
      toStream(new Uint8Array(overrides.size ?? 10)),
      overrides.now ?? NOW,
    );

  it('rejects a tampered size, type, exp or key and a different secret', async () => {
    const root = freshRoot();
    const storage = make(root);
    const { k, url } = await issue(storage, { maxSizeBytes: 10 });
    const sig = url.searchParams.get('sig') ?? '';
    const [, type, mac] = sig.split('.');
    const forged = [
      { sig: `1000000.${type ?? ''}.${mac ?? ''}` },
      { sig: `10.${Buffer.from('image/jpeg').toString('base64url')}.${mac ?? ''}` },
      { sig: `10.${type ?? ''}.${Buffer.from('x').toString('base64url')}` },
      { sig: 'garbage' },
      { sig: '' },
      { exp: String(Number(url.searchParams.get('exp')) + 3600) },
      { exp: 'abc' },
    ];
    for (const override of forged) {
      const result = await accept(storage, k, url, override);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('upload.signature_invalid');
    }
    const otherKey = await accept(storage, key('outbound/zzz/original.png'), url);
    expect(!otherKey.ok && otherKey.error.code).toBe('upload.signature_invalid');
    const otherSecret = await accept(make(root, 'another-secret'), k, url);
    expect(!otherSecret.ok && otherSecret.error.code).toBe('upload.signature_invalid');
  });

  it('accepts exactly the signed size and rejects one byte more without leaving files', async () => {
    const root = freshRoot();
    const storage = make(root);
    const { k, url } = await issue(storage, { maxSizeBytes: 10 });
    const big = await accept(storage, k, url, { size: 11 });
    expect(!big.ok && big.error.code).toBe('media.too_large');
    expect((await storage.inspect(k)).ok).toBe(false);
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
    const exact = await accept(storage, k, url, { size: 10 });
    expect(exact.ok && exact.value.sizeBytes).toBe(10);
  });

  it('expires at exp and uses the later of the passed time and the injected clock', async () => {
    const root = freshRoot();
    const clock = new FakeClock(NOW);
    const storage = createLocalFileStorage({
      rootDir: root,
      baseUrl: BASE_URL,
      secret: SECRET,
      clock,
    });
    const { k, url } = await issue(storage);
    const atExp = await accept(storage, k, url, { now: EXPIRES_AT });
    expect(!atExp.ok && atExp.error.code).toBe('upload.expired');
    clock.set(new Date('2026-11-18T10:30:00Z'));
    const lateClock = await accept(storage, k, url, { now: NOW });
    expect(!lateClock.ok && lateClock.error.code).toBe('upload.expired');
  });

  it('checks the signature before expiry and the type after expiry', async () => {
    const storage = make();
    const { k, url } = await issue(storage);
    const bad = await accept(storage, k, url, { sig: 'x', now: EXPIRES_AT });
    expect(!bad.ok && bad.error.code).toBe('upload.signature_invalid');
    const mismatch = await accept(storage, k, url, { type: 'image/jpeg' });
    expect(!mismatch.ok && mismatch.error.code).toBe('upload.content_mismatch');
    const withParams = await accept(storage, k, url, { type: 'IMAGE/PNG; charset=x' });
    expect(withParams.ok).toBe(true);
  });

  it('stores the signed content type, which read returns', async () => {
    const storage = make();
    const { k, url } = await issue(storage);
    await accept(storage, k, url);
    const read = await storage.read(k);
    expect(read.ok && read.value.contentType).toBe('image/png');
  });
});

describe('local file storage details', () => {
  it('stops reading the body as soon as the cap is passed', async () => {
    const storage = make();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(10));
      },
    });
    const result = await storage.put(key('a/endless.bin'), body, {
      contentType: 'a/b',
      maxSizeBytes: 25,
    });
    expect(!result.ok && result.error.code).toBe('media.too_large');
    expect(pulls).toBeLessThan(10);
  });

  it('keeps the previous file when an overwrite is too large', async () => {
    const storage = make();
    const k = key('a/keep.bin');
    await storage.put(k, toStream(new Uint8Array(5)), { contentType: 'a/b', maxSizeBytes: 10 });
    await storage.put(k, toStream(new Uint8Array(50)), { contentType: 'a/b', maxSizeBytes: 10 });
    const inspected = await storage.inspect(k);
    expect(inspected.ok && inspected.value.sizeBytes).toBe(5);
  });

  it('returns storage.unavailable when the key collides with a directory', async () => {
    const storage = make();
    await storage.put(key('a/b'), toStream(new Uint8Array(1)), {
      contentType: 'a/b',
      maxSizeBytes: 10,
    });
    const result = await storage.put(key('a/b/c'), toStream(new Uint8Array(1)), {
      contentType: 'a/b',
      maxSizeBytes: 10,
    });
    expect(!result.ok && result.error.code).toBe('storage.unavailable');
    const dir = await storage.inspect(key('a'));
    expect(!dir.ok && dir.error.code).toBe('upload.not_found');
  });

  it('falls back to octet-stream when the sidecar is missing and rejects an empty secret', async () => {
    const root = freshRoot();
    const storage = make(root);
    await mkdir(join(root, 'objects', 'x'), { recursive: true });
    await writeFile(join(root, 'objects', 'x', 'raw.bin'), 'abc');
    const read = await storage.read(key('x/raw.bin'));
    expect(read.ok && read.value.contentType).toBe('application/octet-stream');
    const inspected = await storage.inspect(key('x/raw.bin'));
    expect(inspected.ok && inspected.value.contentType).toBeNull();
    expect(() =>
      createLocalFileStorage({
        rootDir: root,
        baseUrl: BASE_URL,
        secret: '',
        clock: new FakeClock(),
      }),
    ).toThrow();
  });

  it('percent-encodes nothing for allowed keys and strips the trailing slash of the base URL', async () => {
    const storage = make();
    const put = await storage.put(key('inbound/t_k-1/original.jpg'), toStream(new Uint8Array(2)), {
      contentType: 'image/jpeg',
      maxSizeBytes: 10,
    });
    expect(put.ok && put.value.publicUrl).toBe(
      `${BASE_URL}/api/local-storage/inbound/t_k-1/original.jpg`,
    );
  });
});
