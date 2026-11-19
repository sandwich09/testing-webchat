import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { StorageKey } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { Clock, FileStorage, StoredObject } from '@/core/ports';

export interface LocalFileStorageConfig {
  /** Directory that holds every stored file. Created on first write. */
  rootDir: string;
  /** Public origin of the app, e.g. `http://localhost:3000`. A trailing slash is ignored. */
  baseUrl: string;
  /** HMAC secret for signed PUT tickets. */
  secret: string;
  clock: Clock;
}

const LEADING_BYTES = 16;
const URL_PREFIX = '/api/local-storage/';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const MAX_KEY_LENGTH = 512;
/** Segments of letters, digits, `.`, `_`, `-`; a segment never starts with `.`, so `.` and `..` cannot occur. */
const KEY_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const DIGITS = /^\d{1,15}$/;

export const isValidLocalStorageKey = (key: string): boolean =>
  key.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(key);

const mediaType = (contentType: string): string =>
  contentType.split(';')[0]?.trim().toLowerCase() ?? '';

const isNotFound = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  'code' in e &&
  (e.code === 'ENOENT' || e.code === 'ENOTDIR');

const errorCode = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string'
    ? e.code
    : 'unknown';

type Written = { kind: 'written'; sizeBytes: number } | { kind: 'too_large' };

export const createLocalFileStorage = (config: LocalFileStorageConfig): FileStorage => {
  if (config.secret.length === 0) throw new Error('local file storage secret must not be empty');
  const root = resolve(config.rootDir);
  const objectsDir = join(root, 'objects');
  const metaDir = join(root, 'meta');
  const tmpDir = join(root, 'tmp');
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  /** Maps a validated key to a path and proves it stays inside `base`. */
  const pathFor = (base: string, key: string, suffix = ''): string | null => {
    if (!isValidLocalStorageKey(key)) return null;
    const full = resolve(base, key + suffix);
    return full.startsWith(base + sep) ? full : null;
  };

  const urlFor = (key: string): string =>
    `${baseUrl}${URL_PREFIX}${key.split('/').map(encodeURIComponent).join('/')}`;

  const mac = (key: string, contentType: string, maxSizeBytes: number, exp: string): Buffer =>
    createHmac('sha256', config.secret)
      .update(`${key}\n${contentType}\n${String(maxSizeBytes)}\n${exp}`)
      .digest();

  /**
   * The `sig` query value is `<maxSizeBytes>.<base64url(contentType)>.<base64url(hmac)>`. The port only
   * hands `exp` and `sig` to `acceptSignedPut`, so the signed size and type travel inside `sig`.
   */
  const makeSig = (key: string, contentType: string, maxSizeBytes: number, exp: string): string =>
    [
      String(maxSizeBytes),
      Buffer.from(contentType, 'utf8').toString('base64url'),
      mac(key, contentType, maxSizeBytes, exp).toString('base64url'),
    ].join('.');

  const parseSig = (
    key: string,
    exp: string,
    sig: string,
  ): { contentType: string; maxSizeBytes: number } | null => {
    const parts = sig.split('.');
    if (parts.length !== 3) return null;
    const [max, encodedType, encodedMac] = parts;
    if (max === undefined || encodedType === undefined || encodedMac === undefined) return null;
    if (!DIGITS.test(max) || !DIGITS.test(exp)) return null;
    const maxSizeBytes = Number(max);
    const contentType = Buffer.from(encodedType, 'base64url').toString('utf8');
    const given = Buffer.from(encodedMac, 'base64url');
    const expected = mac(key, contentType, maxSizeBytes, exp);
    // timingSafeEqual throws on different lengths; the length of an HMAC is not secret.
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return { contentType, maxSizeBytes };
  };

  /** Streams `body` into a temp file and stops as soon as it passes `maxSizeBytes`. */
  const writeTemp = async (
    tmpPath: string,
    body: ReadableStream<Uint8Array>,
    maxSizeBytes: number,
  ): Promise<Written> => {
    await mkdir(tmpDir, { recursive: true });
    let handle: FileHandle | undefined;
    const reader = body.getReader();
    try {
      handle = await open(tmpPath, 'wx');
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxSizeBytes) {
          await reader.cancel().catch(() => undefined);
          await handle.close();
          handle = undefined;
          await unlink(tmpPath).catch(() => undefined);
          return { kind: 'too_large' };
        }
        await handle.write(value);
      }
      await handle.close();
      handle = undefined;
      return { kind: 'written', sizeBytes: total };
    } catch (e) {
      await reader.cancel().catch(() => undefined);
      await handle?.close().catch(() => undefined);
      await unlink(tmpPath).catch(() => undefined);
      throw e;
    }
  };

  const store = async (
    key: StorageKey,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    maxSizeBytes: number,
  ) => {
    const objectPath = pathFor(objectsDir, key);
    const metaPath = pathFor(metaDir, key, '.json');
    if (objectPath === null || metaPath === null) return err('storage.unavailable', 'invalid_key');
    const tmpPath = join(tmpDir, randomUUID());
    try {
      const written = await writeTemp(tmpPath, body, maxSizeBytes);
      if (written.kind === 'too_large') return err('media.too_large');
      await mkdir(dirname(objectPath), { recursive: true });
      await mkdir(dirname(metaPath), { recursive: true });
      await rename(tmpPath, objectPath);
      await writeFile(metaPath, JSON.stringify({ contentType }));
      return ok<StoredObject>({ publicUrl: urlFor(key), sizeBytes: written.sizeBytes });
    } catch (e) {
      await unlink(tmpPath).catch(() => undefined);
      return err('storage.unavailable', errorCode(e));
    }
  };

  const readContentType = async (key: string): Promise<string | null> => {
    const metaPath = pathFor(metaDir, key, '.json');
    if (metaPath === null) return null;
    try {
      const parsed: unknown = JSON.parse(await readFile(metaPath, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null && 'contentType' in parsed) {
        return typeof parsed.contentType === 'string' ? parsed.contentType : null;
      }
    } catch {
      // A missing or unreadable sidecar means the type is unknown.
    }
    return null;
  };

  return {
    issueUpload(spec) {
      if (!isValidLocalStorageKey(spec.key)) {
        return Promise.resolve(err('storage.unavailable', 'invalid_key'));
      }
      const exp = String(Math.floor(spec.expiresAt.getTime() / 1000));
      const sig = makeSig(spec.key, spec.contentType, spec.maxSizeBytes, exp);
      return Promise.resolve(
        ok({
          strategy: 'http_put' as const,
          key: spec.key,
          contentType: spec.contentType,
          maxSizeBytes: spec.maxSizeBytes,
          url: `${urlFor(spec.key)}?exp=${exp}&sig=${sig}`,
          headers: { 'Content-Type': spec.contentType },
        }),
      );
    },

    put: (key, body, opts) => store(key, body, opts.contentType, opts.maxSizeBytes),

    async inspect(key) {
      const objectPath = pathFor(objectsDir, key);
      if (objectPath === null) return err('upload.not_found');
      let handle: FileHandle | undefined;
      try {
        const info = await stat(objectPath);
        if (!info.isFile()) return err('upload.not_found');
        handle = await open(objectPath, 'r');
        const buffer = new Uint8Array(Math.min(LEADING_BYTES, info.size));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        return ok({
          publicUrl: urlFor(key),
          sizeBytes: info.size,
          contentType: await readContentType(key),
          leadingBytes: buffer.slice(0, bytesRead),
        });
      } catch (e) {
        return isNotFound(e) ? err('upload.not_found') : err('storage.unavailable', errorCode(e));
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },

    async read(key) {
      const objectPath = pathFor(objectsDir, key);
      if (objectPath === null) return err('media.not_found');
      try {
        const info = await stat(objectPath);
        if (!info.isFile()) return err('media.not_found');
        const contentType = (await readContentType(key)) ?? DEFAULT_CONTENT_TYPE;
        // Readable.toWeb is typed with a wider chunk type than the port's Uint8Array stream.
        const stream = Readable.toWeb(createReadStream(objectPath)) as ReadableStream<Uint8Array>;
        return ok({ stream, contentType, sizeBytes: info.size });
      } catch (e) {
        return isNotFound(e) ? err('media.not_found') : err('storage.unavailable', errorCode(e));
      }
    },

    async acceptSignedPut(key, query, contentType, body, now) {
      if (!isValidLocalStorageKey(key)) return err('upload.signature_invalid');
      const signed = parseSig(key, query.exp, query.sig);
      if (signed === null) return err('upload.signature_invalid');
      // Never trust a caller clock that runs behind the real one.
      const current = Math.max(now.getTime(), config.clock.now().getTime());
      if (current >= Number(query.exp) * 1000) return err('upload.expired');
      if (mediaType(contentType) !== mediaType(signed.contentType)) {
        return err('upload.content_mismatch');
      }
      return store(key, body, signed.contentType, signed.maxSizeBytes);
    },

    async delete(key) {
      const objectPath = pathFor(objectsDir, key);
      const metaPath = pathFor(metaDir, key, '.json');
      // An invalid key can never name a stored file, so there is nothing to delete.
      if (objectPath === null || metaPath === null) return ok(undefined);
      try {
        for (const path of [objectPath, metaPath]) {
          await unlink(path).catch((e: unknown) => {
            if (!isNotFound(e)) throw e;
          });
        }
        return ok(undefined);
      } catch (e) {
        return err('storage.unavailable', errorCode(e));
      }
    },
  };
};
