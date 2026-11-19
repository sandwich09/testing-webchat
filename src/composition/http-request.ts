import { isIP } from 'node:net';
import type { z } from 'zod';
import type { ContactListCursor } from '@/core/ports';
import type { ContactId, Result } from '@/core/domain';
import { JSON_MAX_BODY_BYTES, PDF_MAX_BYTES, WEBHOOK_MAX_BODY_BYTES, err, ok } from '@/core/domain';
import type { PathNotFoundCode } from '@/contracts';
import { KNOWLEDGE_FILE_FIELD, hasNulCharacter, knowledgeFilePartSchema } from '@/contracts';

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
  if (hasNulCharacter(value)) return err('request.invalid');
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err('request.invalid');
};

/**
 * Path params (already awaited) against a contract schema. A malformed id (pathIdSchema) is
 * answered with the not-found code of its resource, like an id that does not exist.
 */
export const parseParams = <T>(
  schema: z.ZodType<T>,
  params: unknown,
): Result<T, Invalid | PathNotFoundCode> => {
  if (hasNulCharacter(params)) return err('request.invalid');
  const parsed = schema.safeParse(params ?? {});
  if (parsed.success) return ok(parsed.data);
  for (const issue of parsed.error.issues) {
    const notFound: unknown = issue.code === 'custom' ? issue.params?.['notFound'] : undefined;
    if (typeof notFound === 'string') return err(notFound as PathNotFoundCode); // brand: set only by pathIdSchema
  }
  return err('request.invalid');
};

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

  const fileName = baseName(file.name);
  const part = knowledgeFilePartSchema.safeParse({ fileName, sizeBytes: file.size });
  if (!part.success || hasNulCharacter(fileName)) return err('request.invalid');
  return ok({ fileName: part.data.fileName, bytes: new Uint8Array(await file.arrayBuffer()) });
};

// ---------------------------------------------------------------------------
// Client IP and the contact list cursor
// ---------------------------------------------------------------------------

/** The eight hextets of an IPv6 address (already checked by isIP), embedded IPv4 included. */
const ipv6Hextets = (ip: string): number[] => {
  let text = ip.toLowerCase();
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4 !== null) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const zeros =
    tail === undefined ? [] : new Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right].map((h) => parseInt(h, 16));
};

/**
 * The rate-limit subject of an address: an IPv4 address as it is (also when written as
 * `::ffff:a.b.c.d`), and an IPv6 address as its /64 network, since one subscriber usually gets a
 * whole /64 and could otherwise take a fresh address for every attempt.
 */
export const clientSubjectOf = (ip: string): string => {
  if (isIP(ip) === 4) return ip;
  const h = ipv6Hextets(ip);
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    const [hi = 0, lo = 0] = h.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return `${h
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`;
};

/**
 * Caller key for rate limits (docs/architecture/infrastructure.md "IP ของผู้เรียก"): the LAST
 * entry of `x-forwarded-for`, passed through clientSubjectOf, else null.
 *
 * The last entry is the one written by the nearest proxy, which the caller cannot choose: on
 * Vercel the edge sets the header to the address it saw (if it appended to a value the caller
 * sent instead, its own entry would still be last), and `next start` without a proxy fills the
 * header from the socket only when the request has none. Earlier entries, and `x-real-ip`, can be
 * sent by anyone, so they are never read. Anything that is not an IP address gives null, so a
 * forged header cannot become an arbitrary key.
 */
export const clientIpOf = (headers: Headers): string | null => {
  const candidate = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (candidate === undefined || candidate === '' || candidate.length > 45) return null;
  return isIP(candidate) === 0 ? null : clientSubjectOf(candidate);
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
