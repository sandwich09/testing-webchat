import { BlobNotFoundError, del, head, put } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { err, ok } from '@/core/domain';
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

class BodyTooLargeError extends Error {}

/** Counts bytes on the way through and fails the stream at the first byte over the cap. */
const limitStream = (
  body: ReadableStream<Uint8Array>,
  maxSizeBytes: number,
  state: { exceeded: boolean; total: number },
): ReadableStream<Uint8Array> => {
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        state.total += chunk.length;
        if (state.total > maxSizeBytes) {
          state.exceeded = true;
          throw new BodyTooLargeError();
        }
        controller.enqueue(chunk);
      },
    }),
  );
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
          maximumSizeInBytes: spec.maxSizeBytes,
          validUntil: spec.expiresAt.getTime(),
          addRandomSuffix: false,
          // The token is bound to this one pathname, so a retry of the same upload must not fail.
          allowOverwrite: true,
        });
        return ok({
          strategy: 'vercel_blob_client' as const,
          key: spec.key,
          contentType: spec.contentType,
          maxSizeBytes: spec.maxSizeBytes,
          pathname: spec.key,
          clientToken,
        });
      } catch (e) {
        return err('storage.unavailable', detailOf(e));
      }
    },

    async put(key, body, opts) {
      if (!isValidKey(key)) return err('storage.unavailable', 'invalid_key');
      const state = { exceeded: false, total: 0 };
      try {
        const result = await put(key, limitStream(body, opts.maxSizeBytes, state), {
          access: 'public',
          token,
          contentType: opts.contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        return ok({ publicUrl: result.url, sizeBytes: state.total });
      } catch (e) {
        if (state.exceeded) {
          // Best effort: remove anything the store kept of the partial upload.
          await del(key, { token }).catch(() => undefined);
          return err('media.too_large');
        }
        return err('storage.unavailable', detailOf(e));
      }
    },

    async inspect(key) {
      if (!isValidKey(key)) return err('upload.not_found');
      try {
        const meta = await head(key, { token });
        if (!isBlobHost(meta.url)) return err('storage.unavailable', 'unexpected_host');
        const response = await doFetch(meta.url, {
          headers: { Range: `bytes=0-${String(LEADING_BYTES - 1)}` },
          redirect: 'error',
        });
        if (!response.ok) return err('storage.unavailable', `status_${String(response.status)}`);
        return ok({
          publicUrl: meta.url,
          sizeBytes: meta.size,
          contentType: meta.contentType === '' ? null : meta.contentType,
          leadingBytes: await readLeading(response),
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
        await del(key, { token });
        return ok(undefined);
      } catch (e) {
        return e instanceof BlobNotFoundError
          ? ok(undefined)
          : err('storage.unavailable', detailOf(e));
      }
    },
  };
};
