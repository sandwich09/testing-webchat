import type { Result, StorageKey } from '@/core/domain';

export type UploadTarget =
  | {
      /** Local disk. */
      strategy: 'http_put';
      key: StorageKey;
      contentType: string;
      maxSizeBytes: number;
      /**
       * Signed path of PUT /api/local-storage/*key, relative to the app (no origin), so the
       * browser PUTs to the origin it is on, whichever domain that is.
       */
      url: string;
      /** At least Content-Type. */
      headers: Record<string, string>;
    }
  | {
      /** Vercel Blob. */
      strategy: 'vercel_blob_client';
      key: StorageKey;
      contentType: string;
      maxSizeBytes: number;
      /** Equal to key. */
      pathname: string;
      /** Token limited to the pathname, type, size and time. */
      clientToken: string;
    };

export interface StoredObject {
  /** Public HTTPS URL (local: the URL of GET /api/local-storage/*key). */
  publicUrl: string;
  sizeBytes: number;
}

export interface FileStorage {
  /**
   * `sizeBytes` is the exact size of the file the ticket is for (the target's maxSizeBytes). The
   * local disk accepts a PUT of exactly that many bytes; Vercel Blob accepts at most that many.
   */
  issueUpload(spec: {
    key: StorageKey;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<Result<UploadTarget, 'storage.unavailable'>>;

  put(
    key: StorageKey,
    body: ReadableStream<Uint8Array>,
    opts: { contentType: string; maxSizeBytes: number },
  ): Promise<Result<StoredObject, 'media.too_large' | 'storage.unavailable'>>;

  inspect(
    key: StorageKey,
  ): Promise<
    Result<
      StoredObject & { contentType: string | null; leadingBytes: Uint8Array },
      'upload.not_found' | 'storage.unavailable'
    >
  >;

  /** Reads a file. Used only by the local disk adapter through GET /api/local-storage/*key. */
  read(
    key: StorageKey,
  ): Promise<
    Result<
      { stream: ReadableStream<Uint8Array>; contentType: string; sizeBytes: number },
      'media.not_found' | 'storage.unavailable'
    >
  >;

  /**
   * Writes a file the browser PUT. Used only by the local disk adapter. A body longer than the
   * signed size is `media.too_large`; a shorter one (cut on the way) is `upload.incomplete` and
   * is not kept.
   */
  acceptSignedPut(
    key: StorageKey,
    query: { exp: string; sig: string },
    contentType: string,
    body: ReadableStream<Uint8Array>,
    now: Date,
  ): Promise<
    Result<
      StoredObject,
      | 'upload.signature_invalid'
      | 'upload.expired'
      | 'upload.content_mismatch'
      | 'upload.incomplete'
      | 'media.too_large'
      | 'storage.unavailable'
    >
  >;

  /** Idempotent: a missing file counts as success. */
  delete(key: StorageKey): Promise<Result<void, 'storage.unavailable'>>;
}
