import { createHmac } from 'node:crypto';
import type { Result, StorageKey } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { FileStorage, StoredObject, UploadTarget } from '@/core/ports';

export const FAKE_STORAGE_BASE_URL = 'https://fake-storage.test';

interface Ticket {
  key: StorageKey;
  contentType: string;
  maxSizeBytes: number;
  exp: string;
  expiresAt: Date;
}

export interface FakeStoredFile {
  bytes: Uint8Array;
  contentType: string;
}

/** Reads at most `maxSizeBytes` and then stops: null means the body was larger. */
const readLimited = async (
  body: ReadableStream<Uint8Array>,
  maxSizeBytes: number,
): Promise<Uint8Array | null> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxSizeBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const toStream = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice());
      controller.close();
    },
  });

/**
 * In-memory file storage that behaves like the local disk adapter: signed `http_put` tickets,
 * `read` and `acceptSignedPut` work. Tests inspect `files` and can plant files with `seed`.
 */
export class FakeFileStorage implements FileStorage {
  readonly files = new Map<string, FakeStoredFile>();
  private readonly tickets = new Map<string, Ticket>();
  private readonly baseUrl: string;
  private readonly secret: string;
  private unavailable = false;

  constructor(opts: { baseUrl?: string; secret?: string } = {}) {
    this.baseUrl = opts.baseUrl ?? FAKE_STORAGE_BASE_URL;
    this.secret = opts.secret ?? 'fake-storage-secret';
  }

  /** Every later call returns `storage.unavailable` until set back to false. */
  setUnavailable(value: boolean): void {
    this.unavailable = value;
  }

  seed(key: StorageKey, bytes: Uint8Array, contentType: string): void {
    this.files.set(key, { bytes: bytes.slice(), contentType });
  }

  issueUpload(spec: {
    key: StorageKey;
    contentType: string;
    maxSizeBytes: number;
    expiresAt: Date;
  }): Promise<Result<UploadTarget, 'storage.unavailable'>> {
    if (this.unavailable) return Promise.resolve(err('storage.unavailable'));
    const exp = String(spec.expiresAt.getTime());
    const sig = createHmac('sha256', this.secret)
      .update(`${spec.key}\n${spec.contentType}\n${String(spec.maxSizeBytes)}\n${exp}`)
      .digest('base64url');
    this.tickets.set(sig, { ...spec, exp });
    return Promise.resolve(
      ok({
        strategy: 'http_put',
        key: spec.key,
        contentType: spec.contentType,
        maxSizeBytes: spec.maxSizeBytes,
        url: `${this.urlFor(spec.key)}?exp=${exp}&sig=${sig}`,
        headers: { 'Content-Type': spec.contentType },
      }),
    );
  }

  async put(
    key: StorageKey,
    body: ReadableStream<Uint8Array>,
    opts: { contentType: string; maxSizeBytes: number },
  ): Promise<Result<StoredObject, 'media.too_large' | 'storage.unavailable'>> {
    if (this.unavailable) return err('storage.unavailable');
    const bytes = await readLimited(body, opts.maxSizeBytes);
    if (bytes === null) return err('media.too_large');
    this.files.set(key, { bytes, contentType: opts.contentType });
    return ok(this.object(key, bytes));
  }

  inspect(
    key: StorageKey,
  ): Promise<
    Result<
      StoredObject & { contentType: string | null; leadingBytes: Uint8Array },
      'upload.not_found' | 'storage.unavailable'
    >
  > {
    if (this.unavailable) return Promise.resolve(err('storage.unavailable'));
    const file = this.files.get(key);
    if (file === undefined) return Promise.resolve(err('upload.not_found'));
    return Promise.resolve(
      ok({
        ...this.object(key, file.bytes),
        contentType: file.contentType,
        leadingBytes: file.bytes.slice(0, 16),
      }),
    );
  }

  read(
    key: StorageKey,
  ): Promise<
    Result<
      { stream: ReadableStream<Uint8Array>; contentType: string; sizeBytes: number },
      'media.not_found' | 'storage.unavailable'
    >
  > {
    if (this.unavailable) return Promise.resolve(err('storage.unavailable'));
    const file = this.files.get(key);
    if (file === undefined) return Promise.resolve(err('media.not_found'));
    return Promise.resolve(
      ok({
        stream: toStream(file.bytes),
        contentType: file.contentType,
        sizeBytes: file.bytes.length,
      }),
    );
  }

  async acceptSignedPut(
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
      | 'media.too_large'
      | 'storage.unavailable'
    >
  > {
    if (this.unavailable) return err('storage.unavailable');
    const ticket = this.tickets.get(query.sig);
    if (ticket?.key !== key || ticket.exp !== query.exp) return err('upload.signature_invalid');
    if (now.getTime() >= ticket.expiresAt.getTime()) return err('upload.expired');
    if (contentType !== ticket.contentType) return err('upload.content_mismatch');
    return this.put(key, body, { contentType, maxSizeBytes: ticket.maxSizeBytes });
  }

  delete(key: StorageKey): Promise<Result<void, 'storage.unavailable'>> {
    if (this.unavailable) return Promise.resolve(err('storage.unavailable'));
    this.files.delete(key);
    return Promise.resolve(ok(undefined));
  }

  private urlFor(key: string): string {
    return `${this.baseUrl}/api/local-storage/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private object(key: string, bytes: Uint8Array): StoredObject {
    return { publicUrl: this.urlFor(key), sizeBytes: bytes.length };
  }
}
