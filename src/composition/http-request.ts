import { isIP } from 'node:net';
import type { z } from 'zod';
import type { ContactListCursor } from '@/core/ports';
import type { ContactId, Result } from '@/core/domain';
import { JSON_MAX_BODY_BYTES, PDF_MAX_BYTES, WEBHOOK_MAX_BODY_BYTES, err, ok } from '@/core/domain';
import { KNOWLEDGE_FILE_FIELD, knowledgeFilePartSchema } from '@/contracts';

type Invalid = 'request.invalid';
type TooLarge = 'request.too_large';

// ---------------------------------------------------------------------------
// Body reading with a byte cap
// ---------------------------------------------------------------------------

/** Content-Length when present and well formed. */
const declaredLength = (headers: Headers): number | null => {
  const value = headers.get('content-length');
  if (value === null || !/^\d{1,15}$/.test(value.trim())) return null;
  return Number(value.trim());
};

/**
 * Reads the body into memory, stopping as soon as it passes `maxBytes` so an oversized or
 * chunked body is never buffered whole. Content-Length is checked first, without reading.
 */
export const readBodyBytes = async (
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> => {
  const declared = declaredLength(request.headers);
  if (declared !== null && declared > maxBytes) return { ok: false };
  if (request.body === null) return { ok: true, bytes: new Uint8Array(0) };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
};

const mediaTypeOf = (headers: Headers): string =>
  (headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

const utf8 = new TextDecoder('utf-8', { fatal: true });

// ---------------------------------------------------------------------------
// Schema parsing (api-contract "การตรวจ")
// ---------------------------------------------------------------------------

const check = <T>(schema: z.ZodType<T>, value: unknown): Result<T, Invalid> => {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err('request.invalid');
};

/** Path params (already awaited) against a contract schema. */
export const parseParams = <T>(schema: z.ZodType<T>, params: unknown): Result<T, Invalid> =>
  check(schema, params ?? {});

/** Query string against a contract schema. A repeated key is invalid. */
export const parseQuery = <T>(schema: z.ZodType<T>, request: Request): Result<T, Invalid> => {
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(query, key)) return err('request.invalid');
    query[key] = value;
  }
  return check(schema, query);
};

/**
 * JSON body against a contract schema: `Content-Type: application/json`, at most
 * JSON_MAX_BODY_BYTES, valid UTF-8 JSON, then the (strict) schema.
 */
export const parseJsonBody = async <T>(
  schema: z.ZodType<T>,
  request: Request,
): Promise<Result<T, Invalid | TooLarge>> => {
  if (mediaTypeOf(request.headers) !== 'application/json') return err('request.invalid');
  const read = await readBodyBytes(request, JSON_MAX_BODY_BYTES);
  if (!read.ok) return err('request.too_large');
  let value: unknown;
  try {
    value = JSON.parse(utf8.decode(read.bytes));
  } catch {
    return err('request.invalid');
  }
  return check(schema, value);
};

/**
 * Raw text of the LINE webhook body, at most WEBHOOK_MAX_BODY_BYTES, read before any parsing
 * so the signature is checked on exactly what LINE sent (api-contract POST /api/line/webhook).
 */
export const readWebhookBody = async (request: Request): Promise<Result<string, TooLarge>> => {
  const read = await readBodyBytes(request, WEBHOOK_MAX_BODY_BYTES);
  if (!read.ok) return err('request.too_large');
  // Invalid UTF-8 becomes U+FFFD, so such a body fails the signature check instead of throwing.
  return ok(new TextDecoder('utf-8').decode(read.bytes));
};

/** The request body as a stream for PUT /api/local-storage/*key (the use case caps the size). */
export const bodyStream = (request: Request): ReadableStream<Uint8Array> =>
  request.body ?? new Blob([]).stream();

// ---------------------------------------------------------------------------
// PDF upload (POST /api/knowledge/documents and .../:id/retry)
// ---------------------------------------------------------------------------

/** Whole multipart body cap: the PDF plus room for the multipart framing. */
export const PDF_UPLOAD_MAX_BODY_BYTES = PDF_MAX_BYTES + JSON_MAX_BODY_BYTES;

/** Last path segment of a browser-sent file name (some browsers send `C:\\...\\a.pdf`). */
const baseName = (name: string): string => name.split(/[\\/]/).pop()?.trim() ?? '';

/**
 * Reads the single `file` part of a multipart body. Over PDF_UPLOAD_MAX_BODY_BYTES (by
 * Content-Length, without reading, or while reading) gives `knowledge.file_too_large`. Whether
 * the bytes are a PDF and within PDF_MAX_BYTES is judged by IngestDocument.
 */
export const readPdfUpload = async (
  request: Request,
): Promise<
  Result<{ fileName: string; bytes: Uint8Array }, Invalid | 'knowledge.file_too_large'>
> => {
  const read = await readBodyBytes(request, PDF_UPLOAD_MAX_BODY_BYTES);
  if (!read.ok) return err('knowledge.file_too_large');
  const contentType = request.headers.get('content-type') ?? '';
  if (mediaTypeOf(request.headers) !== 'multipart/form-data') return err('request.invalid');

  let form: FormData;
  try {
    // Uint8Array -> Blob keeps the bytes; the original Content-Type carries the boundary.
    form = await new Response(new Blob([read.bytes as Uint8Array<ArrayBuffer>]), {
      headers: { 'Content-Type': contentType },
    }).formData();
  } catch {
    return err('request.invalid');
  }

  const entries = [...form.entries()];
  const [first] = entries;
  if (entries.length !== 1 || first === undefined || first[0] !== KNOWLEDGE_FILE_FIELD) {
    return err('request.invalid');
  }
  const file = first[1];
  if (typeof file === 'string') return err('request.invalid');

  const part = knowledgeFilePartSchema.safeParse({
    fileName: baseName(file.name),
    sizeBytes: file.size,
  });
  if (!part.success) return err('request.invalid');
  return ok({ fileName: part.data.fileName, bytes: new Uint8Array(await file.arrayBuffer()) });
};

// ---------------------------------------------------------------------------
// Client IP and the contact list cursor
// ---------------------------------------------------------------------------

/**
 * Caller IP for rate limits: the first `x-forwarded-for` entry, else `x-real-ip`, else null
 * (use-cases RequestContext; which header Vercel sets is still to be confirmed). Anything that
 * is not an IP address counts as unknown, so a forged header cannot become an arbitrary key.
 */
export const clientIpOf = (headers: Headers): string | null => {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate =
    forwarded !== undefined && forwarded !== '' ? forwarded : headers.get('x-real-ip')?.trim();
  if (candidate === undefined || candidate === '' || candidate.length > 45) return null;
  return isIP(candidate) === 0 ? null : candidate;
};

const CURSOR_ID = /^[A-Za-z0-9-]{1,100}$/;

/** `before` of GET /api/contacts: opaque base64url of `{ sortAt, id }` (api-contract). */
export const encodeContactCursor = (cursor: ContactListCursor): string =>
  Buffer.from(
    JSON.stringify({ sortAt: cursor.sortAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');

/** Reverse of encodeContactCursor. Anything else, including a tampered value, is request.invalid. */
export const decodeContactCursor = (value: string): Result<ContactListCursor, Invalid> => {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return err('request.invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8.decode(Buffer.from(value, 'base64url')));
  } catch {
    return err('request.invalid');
  }
  if (typeof parsed !== 'object' || parsed === null) return err('request.invalid');
  const { sortAt, id } = parsed as Record<string, unknown>; // shape checked field by field below
  if (typeof sortAt !== 'string' || typeof id !== 'string' || !CURSOR_ID.test(id)) {
    return err('request.invalid');
  }
  const at = new Date(sortAt);
  if (Number.isNaN(at.getTime()) || at.toISOString() !== sortAt) return err('request.invalid');
  return ok({ sortAt: at, id: id as ContactId }); // id came from a ContactId the server encoded
};
