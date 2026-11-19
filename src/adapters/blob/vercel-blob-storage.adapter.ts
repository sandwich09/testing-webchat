import { BlobNotFoundError, del, head, put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { STORAGE_CALL_TIMEOUT_MS, STORAGE_PUT_TIMEOUT_MS, err, ok } from '@/core/domain';
import type { FileStorage } from '@/core/ports';

export interface VercelBlobStorageConfig {
  /** Read-write token of the Blob store. Never logged. */
  token: string;
  /** Used by `inspect` for the Range read; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

const LEADING_BYTES = 16;
const MAX_KEY_LENGTH = 512;
/** Same key shape as the local disk adapter; adapters may not import each other. */
const KEY_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
/** `inspect` fetches only from the store's own public host, never from a URL a user supplied. */
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

const isValidKey = (key: string): boolean => key.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(key);

const isBlobHost = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
};

type ReadOutcome =
  | { kind: 'read'; bytes: Buffer }
  | { kind: 'too_large' }
  | { kind: 'source_failed'; error: unknown };

/**
 * Reads the whole body into memory, failing at the first byte over the cap (the rest is not read:
 * the source is cancelled). Nothing is sent to Blob before the body has ended, so a body that
 * breaks or is too large never leaves a partial file, and the upload always has a known length.
 */
const readAll = async (
  body: ReadableStream<Uint8Array>,
  maxSizeBytes: number,
): Promise<ReadOutcome> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxSizeBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  } catch (e) {
    return { kind: 'source_failed', error: e };
  }
  return { kind: 'read', bytes: Buffer.concat(chunks, total) };
};

class StorageTimeoutError extends Error {
  constructor() {
    super('storage call timed out');
    this.name = 'TimeoutError';
  }
}

/**
 * Runs one SDK call with an abort signal that fires after `ms`, and settles at that time even when
 * the call ignores its signal, so no Blob call can hold the job past its own bound.
 */
const withTimeout = async <T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new StorageTimeoutError();
      controller.abort(e);
      reject(e);
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const detailOf = (e: unknown): string => (e instanceof Error ? e.name : 'unknown');

/** First `LEADING_BYTES` of a response body; stops reading once it has them. */
const readLeading = async (response: Response): Promise<Uint8Array> => {
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array(0);
  const out = new Uint8Array(LEADING_BYTES);
  let filled = 0;
  while (filled < LEADING_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.length, LEADING_BYTES - filled);
    out.set(value.subarray(0, take), filled);
    filled += take;
  }
  await reader.cancel().catch(() => undefined);
  return out.slice(0, filled);
};

export const createVercelBlobStorage = (config: VercelBlobStorageConfig): FileStorage => {
  if (config.token.length === 0) throw new Error('Vercel Blob token must not be empty');
  const { token } = config;
  const doFetch = config.fetch ?? fetch;

  return {
    async issueUpload(spec) {
      if (!isValidKey(spec.key)) return err('storage.unavailable', 'invalid_key');
      try {
        const clientToken = await generateClientTokenFromReadWriteToken({
          token,
          pathname: spec.key,
          allowedContentTypes: [spec.contentType],
          // Blob can only cap the size; the browser uploads straight to Blob, not through the
          // app, so nothing on the way cuts the body short.
          maximumSizeInBytes: spec.sizeBytes,
          validUntil: spec.expiresAt.getTime(),
          addRandomSuffix: false,
          // The token is bound to this one pathname, so a retry of the same upload must not fail.
          allowOverwrite: true,
        });
        return ok({
          strategy: 'vercel_blob_client' as const,
          key: spec.key,
          contentType: spec.contentType,
          maxSizeBytes: spec.sizeBytes,
          pathname: spec.key,
          clientToken,
        });
      } catch (e) {
        return err('storage.unavailable', detailOf(e));
      }
    },

    async put(key, body, opts) {
      if (!isValidKey(key)) {
        await body.cancel().catch(() => undefined);
        return err('storage.unavailable', 'invalid_key');
      }
      // Buffer first, then one upload of a known length. A streamed body of unknown length was
      // seen to hang for a real photo while a tiny file passed (ADR 0033).
      const read = await readAll(body, opts.maxSizeBytes);
      if (read.kind === 'too_large') return err('media.too_large');
      if (read.kind === 'source_failed') return err('storage.unavailable', 'source_failed');
      try {
        const result = await withTimeout(STORAGE_PUT_TIMEOUT_MS, (abortSignal) =>
          put(key, read.bytes, {
            access: 'public',
            token,
            contentType: opts.contentType,
            addRandomSuffix: false,
            allowOverwrite: true,
            abortSignal,
          }),
        );
        return ok({ publicUrl: result.url, sizeBytes: read.bytes.byteLength });
      } catch (e) {
        // A timed-out upload may still land; the message never points at it, so it is unreachable.
        return err('storage.unavailable', detailOf(e));
      }
    },

    async inspect(key) {
      if (!isValidKey(key)) return err('upload.not_found');
      try {
        return await withTimeout(STORAGE_CALL_TIMEOUT_MS, async (abortSignal) => {
          const meta = await head(key, { token, abortSignal });
          if (!isBlobHost(meta.url)) return err('storage.unavailable', 'unexpected_host');
          const response = await doFetch(meta.url, {
            headers: { Range: `bytes=0-${String(LEADING_BYTES - 1)}` },
            redirect: 'error',
            signal: abortSignal,
          });
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            return err('storage.unavailable', `status_${String(response.status)}`);
          }
          return ok({
            publicUrl: meta.url,
            sizeBytes: meta.size,
            contentType: meta.contentType === '' ? null : meta.contentType,
            leadingBytes: await readLeading(response),
          });
        });
      } catch (e) {
        return e instanceof BlobNotFoundError
          ? err('upload.not_found')
          : err('storage.unavailable', detailOf(e));
      }
    },

    // Files on Blob are opened from their public URL; the app never proxies them.
    read: () => Promise.resolve(err('media.not_found')),

    // Browsers upload with a client token, never with a signed PUT to this app.
    acceptSignedPut: () => Promise.resolve(err('upload.signature_invalid')),

    async delete(key) {
      if (!isValidKey(key)) return ok(undefined);
      try {
        await withTimeout(STORAGE_CALL_TIMEOUT_MS, (abortSignal) =>
          del(key, { token, abortSignal }),
        );
        return ok(undefined);
      } catch (e) {
        return e instanceof BlobNotFoundError
          ? ok(undefined)
          : err('storage.unavailable', detailOf(e));
      }
    },
  };
};
