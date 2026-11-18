import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ContactId } from '@/core/domain';
import { JSON_MAX_BODY_BYTES, PDF_MAX_BYTES, WEBHOOK_MAX_BODY_BYTES } from '@/core/domain';
import { getMessagesQuerySchema, listContactsQuerySchema, unlockBodySchema } from '@/contracts';
import {
  PDF_UPLOAD_MAX_BODY_BYTES,
  bodyStream,
  clientIpOf,
  decodeContactCursor,
  encodeContactCursor,
  parseJsonBody,
  parseParams,
  parseQuery,
  readBodyBytes,
  readPdfUpload,
  readWebhookBody,
} from './http-request';

const URL_BASE = 'http://localhost:3000';

const jsonRequest = (body: string, headers: Record<string, string> = {}): Request =>
  new Request(`${URL_BASE}/api/x`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

/** A body sent in chunks with no Content-Length, as a chunked upload would arrive. */
const chunkedRequest = (chunks: Uint8Array[], headers: Record<string, string> = {}): Request => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Request(`${URL_BASE}/api/x`, {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit);
};

describe('readBodyBytes', () => {
  it('reads a body within the cap', async () => {
    const r = await readBodyBytes(jsonRequest('{"a":1}'), 100);
    expect(r.ok && new TextDecoder().decode(r.bytes)).toBe('{"a":1}');
  });

  it('refuses by Content-Length without reading the body', async () => {
    // An endless body: reading it would never finish. (The runtime may prefetch a chunk.)
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const request = new Request(`${URL_BASE}/api/x`, {
      method: 'POST',
      headers: { 'content-length': '101' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect((await readBodyBytes(request, 100)).ok).toBe(false);
    expect(pulls).toBeLessThanOrEqual(2);
  });

  it('stops a chunked body as soon as it passes the cap', async () => {
    const r = await readBodyBytes(chunkedRequest([new Uint8Array(60), new Uint8Array(60)]), 100);
    expect(r.ok).toBe(false);
  });

  it('reads exactly the cap', async () => {
    const r = await readBodyBytes(chunkedRequest([new Uint8Array(50), new Uint8Array(50)]), 100);
    expect(r.ok && r.bytes.byteLength).toBe(100);
  });

  it('gives an empty body for a request without one', async () => {
    const r = await readBodyBytes(new Request(`${URL_BASE}/api/x`, { method: 'POST' }), 10);
    expect(r.ok && r.bytes.byteLength).toBe(0);
  });
});

describe('parseJsonBody', () => {
  it('parses a body that matches the strict schema', async () => {
    expect(await parseJsonBody(unlockBodySchema, jsonRequest('{"code":" abc "}'))).toEqual({
      ok: true,
      value: { code: 'abc' },
    });
  });

  it('accepts a charset parameter on the content type', async () => {
    const r = await parseJsonBody(
      unlockBodySchema,
      jsonRequest('{"code":"x"}', { 'content-type': 'application/json; charset=utf-8' }),
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    ['an unknown field', '{"code":"x","extra":1}'],
    ['a missing field', '{}'],
    ['broken JSON', '{"code":'],
    ['an empty body', ''],
  ])('answers request.invalid for %s', async (_label, body) => {
    const r = await parseJsonBody(unlockBodySchema, jsonRequest(body));
    expect(r).toMatchObject({ ok: false, error: { code: 'request.invalid' } });
  });

  it('answers request.invalid for a non-JSON content type', async () => {
    const r = await parseJsonBody(
      unlockBodySchema,
      jsonRequest('{"code":"x"}', { 'content-type': 'text/plain' }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'request.invalid' } });
  });

  it('answers request.invalid for invalid UTF-8', async () => {
    const bytes = new Uint8Array([0x7b, 0x22, 0x63, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    const r = await parseJsonBody(
      z.strictObject({ c: z.string() }),
      chunkedRequest([bytes], { 'content-type': 'application/json' }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'request.invalid' } });
  });

  it('answers request.too_large above JSON_MAX_BODY_BYTES', async () => {
    const big = JSON.stringify({ code: 'x'.repeat(JSON_MAX_BODY_BYTES) });
    const r = await parseJsonBody(unlockBodySchema, jsonRequest(big));
    expect(r).toMatchObject({ ok: false, error: { code: 'request.too_large' } });
  });
});

describe('parseQuery and parseParams', () => {
  it('parses the query string with the contract schema', () => {
    const r = parseQuery(
      getMessagesQuerySchema,
      new Request(`${URL_BASE}/api/contacts/c/messages?beforeSeq=12&limit=5`),
    );
    expect(r).toEqual({ ok: true, value: { beforeSeq: '12', limit: 5 } });
  });

  it('rejects unknown keys, repeated keys and refinements', () => {
    const at = (q: string) => new Request(`${URL_BASE}/api/contacts?${q}`);
    expect(parseQuery(listContactsQuerySchema, at('nope=1')).ok).toBe(false);
    expect(parseQuery(listContactsQuerySchema, at('filter=all&filter=unread')).ok).toBe(false);
    expect(parseQuery(listContactsQuerySchema, at('filter=all&afterUpdatedSeq=3')).ok).toBe(false);
    expect(parseQuery(listContactsQuerySchema, at('')).ok).toBe(true);
  });

  it('checks path params and treats missing params as an empty object', () => {
    const schema = z.strictObject({ id: z.string().min(1) });
    expect(parseParams(schema, { id: 'a' })).toEqual({ ok: true, value: { id: 'a' } });
    expect(parseParams(schema, { id: '' })).toMatchObject({ ok: false });
    expect(parseParams(z.strictObject({}), undefined)).toEqual({ ok: true, value: {} });
  });
});

describe('readWebhookBody', () => {
  it('returns the exact raw text', async () => {
    const raw = '{"events":[] }\n';
    const r = await readWebhookBody(jsonRequest(raw));
    expect(r).toEqual({ ok: true, value: raw });
  });

  it('answers request.too_large above WEBHOOK_MAX_BODY_BYTES', async () => {
    const r = await readWebhookBody(
      chunkedRequest([new Uint8Array(WEBHOOK_MAX_BODY_BYTES), new Uint8Array(1)]),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'request.too_large' } });
  });
});

describe('bodyStream', () => {
  it('gives the request stream, or an empty one', async () => {
    const withBody = new Request(`${URL_BASE}/x`, { method: 'PUT', body: 'abc' });
    expect(await new Response(bodyStream(withBody)).text()).toBe('abc');
    const without = new Request(`${URL_BASE}/x`, { method: 'PUT' });
    expect(await new Response(bodyStream(without)).text()).toBe('');
  });
});

const PDF_HEAD = new TextEncoder().encode('%PDF-1.7\n');

const formRequest = (form: FormData, headers: Record<string, string> = {}): Request =>
  new Request(`${URL_BASE}/api/knowledge/documents`, { method: 'POST', body: form, headers });

describe('readPdfUpload', () => {
  it('reads the single file part and strips the path from its name', async () => {
    const form = new FormData();
    form.append('file', new Blob([PDF_HEAD]), 'C:\\Users\\me\\menu.pdf');
    const r = await readPdfUpload(formRequest(form));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fileName).toBe('menu.pdf');
    expect([...r.value.bytes]).toEqual([...PDF_HEAD]);
  });

  it('strips a POSIX path too', async () => {
    const form = new FormData();
    form.append('file', new Blob([PDF_HEAD]), 'docs/a/b.pdf');
    const r = await readPdfUpload(formRequest(form));
    expect(r.ok && r.value.fileName).toBe('b.pdf');
  });

  it.each([
    [
      'no file part',
      () => {
        const f = new FormData();
        f.append('other', new Blob([PDF_HEAD]), 'a.pdf');
        return f;
      },
    ],
    [
      'a text field instead of a file',
      () => {
        const f = new FormData();
        f.append('file', 'not a file');
        return f;
      },
    ],
    [
      'two parts',
      () => {
        const f = new FormData();
        f.append('file', new Blob([PDF_HEAD]), 'a.pdf');
        f.append('file', new Blob([PDF_HEAD]), 'b.pdf');
        return f;
      },
    ],
    [
      'a name over 200 characters',
      () => {
        const f = new FormData();
        f.append('file', new Blob([PDF_HEAD]), `${'a'.repeat(201)}.pdf`);
        return f;
      },
    ],
  ])('answers request.invalid for %s', async (_label, build) => {
    const r = await readPdfUpload(formRequest(build()));
    expect(r).toMatchObject({ ok: false, error: { code: 'request.invalid' } });
  });

  it('answers request.invalid for a body that is not multipart', async () => {
    const r = await readPdfUpload(jsonRequest('{}'));
    expect(r).toMatchObject({ ok: false, error: { code: 'request.invalid' } });
  });

  it('answers knowledge.file_too_large from Content-Length without reading the body', async () => {
    const request = chunkedRequest([PDF_HEAD], {
      'content-type': 'multipart/form-data; boundary=x',
      'content-length': String(PDF_UPLOAD_MAX_BODY_BYTES + 1),
    });
    const r = await readPdfUpload(request);
    expect(r).toMatchObject({ ok: false, error: { code: 'knowledge.file_too_large' } });
  });

  it('answers knowledge.file_too_large when a body without Content-Length grows past the cap', async () => {
    const r = await readPdfUpload(
      chunkedRequest([new Uint8Array(PDF_UPLOAD_MAX_BODY_BYTES), new Uint8Array(1)], {
        'content-type': 'multipart/form-data; boundary=x',
      }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'knowledge.file_too_large' } });
  });

  it('leaves a PDF just over PDF_MAX_BYTES to the use case', async () => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PDF_MAX_BYTES + 1)]), 'big.pdf');
    const r = await readPdfUpload(formRequest(form));
    expect(r.ok && r.value.bytes.byteLength).toBe(PDF_MAX_BYTES + 1);
  });
});

describe('clientIpOf', () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it('takes the first x-forwarded-for entry', () => {
    expect(clientIpOf(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIpOf(h({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('falls back to x-real-ip, then null', () => {
    expect(clientIpOf(h({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIpOf(h({}))).toBeNull();
  });

  it('ignores a value that is not an IP address', () => {
    expect(clientIpOf(h({ 'x-forwarded-for': 'evil-key, 1.2.3.4' }))).toBeNull();
    expect(clientIpOf(h({ 'x-forwarded-for': `1.2.3.4${'0'.repeat(50)}` }))).toBeNull();
  });
});

describe('contact cursor', () => {
  const cursor = {
    sortAt: new Date('2026-11-18T07:32:10.123Z'),
    id: '0193a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b' as ContactId,
  };

  it('round-trips through an opaque base64url string', () => {
    const encoded = encodeContactCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeContactCursor(encoded)).toEqual({ ok: true, value: cursor });
  });

  it('is accepted by the contract schema of `before`', () => {
    const r = listContactsQuerySchema.safeParse({ before: encodeContactCursor(cursor) });
    expect(r.success).toBe(true);
  });

  it.each([
    ['not base64url', 'a+b/c='],
    ['not JSON', Buffer.from('nope').toString('base64url')],
    ['a JSON scalar', Buffer.from('1').toString('base64url')],
    ['a bad date', Buffer.from('{"sortAt":"yesterday","id":"a"}').toString('base64url')],
    ['a non-canonical date', Buffer.from('{"sortAt":"2026-11-18","id":"a"}').toString('base64url')],
    [
      'a bad id',
      Buffer.from('{"sortAt":"2026-11-18T07:32:10.123Z","id":"a b"}').toString('base64url'),
    ],
    ['a missing id', Buffer.from('{"sortAt":"2026-11-18T07:32:10.123Z"}').toString('base64url')],
  ])('answers request.invalid for %s', (_label, value) => {
    expect(decodeContactCursor(value)).toMatchObject({
      ok: false,
      error: { code: 'request.invalid' },
    });
  });
});
