import { describe, expect, it } from 'vitest';
import type { StorageKey } from '@/core/domain';
import type { FileStorage } from '@/core/ports';

/** The port table gives the two adapter families different answers for `read` and `acceptSignedPut`. */
export type FileStorageKind = 'local_disk' | 'vercel_blob';

let counter = 0;
const newKey = (name = 'file.bin'): StorageKey =>
  `suite/${String(++counter)}-${String(Date.now())}/${name}` as StorageKey;

const toStream = (bytes: Uint8Array, chunkSize = 7): ReadableStream<Uint8Array> => {
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

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
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

const bytesOf = (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, i) => (i * 7 + 3) % 256);

const EXPIRES_AT = new Date('2026-11-18T10:00:00Z');
const BEFORE_EXPIRY = new Date('2026-11-18T09:59:00Z');
const AFTER_EXPIRY = new Date('2026-11-18T10:00:01Z');

/** Runs every row of the FileStorage table in domain-and-ports against the subject. */
export const describeFileStorageSuite = (
  makeSubject: () => FileStorage | Promise<FileStorage>,
  kind: FileStorageKind,
): void => {
  describe('FileStorage.issueUpload', () => {
    it('returns a target for the exact key, type and size', async () => {
      const storage = await makeSubject();
      const key = newKey('photo.png');
      const result = await storage.issueUpload({
        key,
        contentType: 'image/png',
        sizeBytes: 1024,
        expiresAt: EXPIRES_AT,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const target = result.value;
      expect(target.key).toBe(key);
      expect(target.contentType).toBe('image/png');
      expect(target.maxSizeBytes).toBe(1024);
      if (kind === 'local_disk') {
        expect(target.strategy).toBe('http_put');
        if (target.strategy !== 'http_put') return;
        expect(target.headers['Content-Type']).toBe('image/png');
        // A path without an origin: the browser PUTs to the origin it is on.
        expect(target.url.startsWith('/api/local-storage/')).toBe(true);
        const url = new URL(target.url, 'http://any.origin');
        expect(url.searchParams.get('exp')).toBeTruthy();
        expect(url.searchParams.get('sig')).toBeTruthy();
        expect(decodeURIComponent(url.pathname)).toContain(key);
      } else {
        expect(target.strategy).toBe('vercel_blob_client');
        if (target.strategy !== 'vercel_blob_client') return;
        expect(target.pathname).toBe(key);
        expect(target.clientToken.length).toBeGreaterThan(0);
      }
    });
  });

  describe('FileStorage.put and inspect', () => {
    it('streams the body in and reports its public url and size', async () => {
      const storage = await makeSubject();
      const key = newKey('a.png');
      const bytes = bytesOf(100);
      const put = await storage.put(key, toStream(bytes), {
        contentType: 'image/png',
        maxSizeBytes: 1000,
      });
      expect(put.ok).toBe(true);
      if (!put.ok) return;
      expect(put.value.sizeBytes).toBe(100);
      expect(new URL(put.value.publicUrl).protocol).toMatch(/^https?:$/);
      const inspected = await storage.inspect(key);
      expect(inspected.ok).toBe(true);
      if (!inspected.ok) return;
      expect(inspected.value.sizeBytes).toBe(100);
      expect(inspected.value.contentType).toBe('image/png');
      expect(inspected.value.publicUrl).toBe(put.value.publicUrl);
    });

    it('returns at least the first 16 bytes from inspect', async () => {
      const storage = await makeSubject();
      const key = newKey();
      const bytes = bytesOf(100);
      await storage.put(key, toStream(bytes), {
        contentType: 'application/octet-stream',
        maxSizeBytes: 1000,
      });
      const inspected = await storage.inspect(key);
      expect(inspected.ok).toBe(true);
      if (!inspected.ok) return;
      expect(inspected.value.leadingBytes.length).toBeGreaterThanOrEqual(16);
      expect(inspected.value.leadingBytes.slice(0, 16)).toEqual(bytes.slice(0, 16));
    });

    it('returns the whole file from inspect when it is shorter than 16 bytes', async () => {
      const storage = await makeSubject();
      const key = newKey();
      const bytes = bytesOf(5);
      await storage.put(key, toStream(bytes), {
        contentType: 'application/octet-stream',
        maxSizeBytes: 1000,
      });
      const inspected = await storage.inspect(key);
      expect(inspected.ok && inspected.value.leadingBytes).toEqual(bytes);
    });

    it('accepts a body of exactly maxSizeBytes', async () => {
      const storage = await makeSubject();
      const put = await storage.put(newKey(), toStream(bytesOf(64)), {
        contentType: 'image/png',
        maxSizeBytes: 64,
      });
      expect(put.ok).toBe(true);
    });

    it('returns media.too_large and keeps nothing when the body exceeds maxSizeBytes', async () => {
      const storage = await makeSubject();
      const key = newKey();
      const put = await storage.put(key, toStream(bytesOf(65)), {
        contentType: 'image/png',
        maxSizeBytes: 64,
      });
      expect(put.ok).toBe(false);
      if (!put.ok) expect(put.error.code).toBe('media.too_large');
      const inspected = await storage.inspect(key);
      expect(inspected.ok).toBe(false);
      if (!inspected.ok) expect(inspected.error.code).toBe('upload.not_found');
    });

    it('overwrites an existing key', async () => {
      const storage = await makeSubject();
      const key = newKey();
      await storage.put(key, toStream(bytesOf(10)), {
        contentType: 'image/png',
        maxSizeBytes: 100,
      });
      await storage.put(key, toStream(bytesOf(30)), {
        contentType: 'image/jpeg',
        maxSizeBytes: 100,
      });
      const inspected = await storage.inspect(key);
      expect(inspected.ok && inspected.value.sizeBytes).toBe(30);
      expect(inspected.ok && inspected.value.contentType).toBe('image/jpeg');
    });

    it('returns upload.not_found for a missing file', async () => {
      const storage = await makeSubject();
      const inspected = await storage.inspect(newKey());
      expect(inspected.ok).toBe(false);
      if (!inspected.ok) expect(inspected.error.code).toBe('upload.not_found');
    });
  });

  describe('FileStorage.read', () => {
    if (kind === 'local_disk') {
      it('returns the stored bytes, type and size (local disk)', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const bytes = bytesOf(50);
        await storage.put(key, toStream(bytes), { contentType: 'image/webp', maxSizeBytes: 100 });
        const read = await storage.read(key);
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.value.contentType).toBe('image/webp');
        expect(read.value.sizeBytes).toBe(50);
        expect(await readAll(read.value.stream)).toEqual(bytes);
      });
    }

    if (kind === 'local_disk') {
      it('returns media.not_found for a missing file (local disk)', async () => {
        const storage = await makeSubject();
        const read = await storage.read(newKey());
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.error.code).toBe('media.not_found');
      });
    }

    if (kind === 'vercel_blob') {
      it('always returns media.not_found, even for a stored file (Vercel Blob)', async () => {
        const storage = await makeSubject();
        const key = newKey();
        await storage.put(key, toStream(bytesOf(5)), {
          contentType: 'image/png',
          maxSizeBytes: 100,
        });
        const read = await storage.read(key);
        expect(read.ok).toBe(false);
        if (!read.ok) expect(read.error.code).toBe('media.not_found');
      });
    }
  });

  describe('FileStorage.acceptSignedPut', () => {
    const issue = async (storage: FileStorage, key: StorageKey, sizeBytes = 40) => {
      const issued = await storage.issueUpload({
        key,
        contentType: 'image/png',
        sizeBytes,
        expiresAt: EXPIRES_AT,
      });
      if (!issued.ok || issued.value.strategy !== 'http_put')
        throw new Error('expected an http_put target');
      const url = new URL(issued.value.url, 'http://any.origin');
      return { exp: url.searchParams.get('exp') ?? '', sig: url.searchParams.get('sig') ?? '' };
    };

    if (kind === 'local_disk') {
      it('stores the body at the key when the signature, time and type are right', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const query = await issue(storage, key);
        const bytes = bytesOf(40);
        const result = await storage.acceptSignedPut(
          key,
          query,
          'image/png',
          toStream(bytes),
          BEFORE_EXPIRY,
        );
        expect(result.ok && result.value.sizeBytes).toBe(40);
        const inspected = await storage.inspect(key);
        expect(inspected.ok && inspected.value.sizeBytes).toBe(40);
      });
    }

    if (kind === 'local_disk') {
      it('returns upload.signature_invalid for a wrong signature or another key', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const query = await issue(storage, key);
        const wrongSig = await storage.acceptSignedPut(
          key,
          { ...query, sig: `${query.sig.slice(0, -2)}xx` },
          'image/png',
          toStream(bytesOf(4)),
          BEFORE_EXPIRY,
        );
        const otherKey = await storage.acceptSignedPut(
          newKey(),
          query,
          'image/png',
          toStream(bytesOf(4)),
          BEFORE_EXPIRY,
        );
        for (const result of [wrongSig, otherKey]) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('upload.signature_invalid');
        }
      });
    }

    if (kind === 'local_disk') {
      it('returns upload.expired once exp has passed', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const query = await issue(storage, key);
        const result = await storage.acceptSignedPut(
          key,
          query,
          'image/png',
          toStream(bytesOf(4)),
          AFTER_EXPIRY,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('upload.expired');
      });
    }

    if (kind === 'local_disk') {
      it('returns upload.content_mismatch when the Content-Type differs', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const query = await issue(storage, key);
        const result = await storage.acceptSignedPut(
          key,
          query,
          'image/jpeg',
          toStream(bytesOf(4)),
          BEFORE_EXPIRY,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('upload.content_mismatch');
      });
    }

    if (kind === 'local_disk') {
      it('returns media.too_large when the body exceeds the signed size', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const query = await issue(storage, key, 10);
        const result = await storage.acceptSignedPut(
          key,
          query,
          'image/png',
          toStream(bytesOf(11)),
          BEFORE_EXPIRY,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('media.too_large');
      });
    }

    if (kind === 'local_disk') {
      it('returns upload.incomplete and keeps nothing when the body is shorter than the signed size', async () => {
        const storage = await makeSubject();
        const key = newKey();
        const query = await issue(storage, key, 10);
        const result = await storage.acceptSignedPut(
          key,
          query,
          'image/png',
          toStream(bytesOf(9)),
          BEFORE_EXPIRY,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('upload.incomplete');
        expect((await storage.inspect(key)).ok).toBe(false);
      });
    }

    if (kind === 'vercel_blob') {
      it('always returns upload.signature_invalid (Vercel Blob)', async () => {
        const storage = await makeSubject();
        const result = await storage.acceptSignedPut(
          newKey(),
          { exp: '1', sig: 'x' },
          'image/png',
          toStream(bytesOf(4)),
          BEFORE_EXPIRY,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('upload.signature_invalid');
      });
    }
  });

  describe('FileStorage.delete', () => {
    it('removes the file', async () => {
      const storage = await makeSubject();
      const key = newKey();
      await storage.put(key, toStream(bytesOf(5)), { contentType: 'image/png', maxSizeBytes: 100 });
      expect((await storage.delete(key)).ok).toBe(true);
      const inspected = await storage.inspect(key);
      expect(inspected.ok).toBe(false);
    });

    it('succeeds when there is no such file (idempotent)', async () => {
      const storage = await makeSubject();
      const key = newKey();
      expect((await storage.delete(key)).ok).toBe(true);
      expect((await storage.delete(key)).ok).toBe(true);
    });
  });
};
