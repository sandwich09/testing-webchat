import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE_TTL_MS } from '@/core/domain';
import { errorResponseSchema } from '@/contracts';
import {
  ACCESS_COOKIE_NAME,
  accessClearedResponse,
  accessCookieHeader,
  accessGrantedResponse,
  parseByteRange,
  sliceStream,
  clearedAccessCookieHeader,
  errorResponse,
  fail,
  isRouteFailure,
  json,
  noContent,
  readAccessToken,
} from './http-response';

describe('responses', () => {
  it('json sets the documented content type and status', async () => {
    const r = json({ a: 1 }, 202);
    expect(r.status).toBe(202);
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await r.json()).toEqual({ a: 1 });
  });

  it('noContent is a 204 without a body', async () => {
    const r = noContent();
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
  });

  it('errorResponse writes the error body and status', async () => {
    const r = errorResponse({ code: 'contact.not_found' }, 'req-9');
    expect(r.status).toBe(404);
    expect(errorResponseSchema.parse(await r.json()).error).toMatchObject({
      code: 'contact.not_found',
      requestId: 'req-9',
    });
    expect(r.headers.get('retry-after')).toBeNull();
  });

  it('adds Retry-After in whole seconds on a 429', () => {
    expect(
      errorResponse({ code: 'message.rate_limited', retryAfterSeconds: 2.2 }, 'r').headers.get(
        'retry-after',
      ),
    ).toBe('3');
    expect(
      errorResponse({ code: 'access.rate_limited', retryAfterSeconds: 0 }, 'r').headers.get(
        'retry-after',
      ),
    ).toBe('1');
  });

  it('applies status overrides', () => {
    expect(
      errorResponse({ code: 'line.not_configured' }, 'r', { 'line.not_configured': 401 }).status,
    ).toBe(401);
  });

  it('fail and isRouteFailure', () => {
    const f = fail('upload.rate_limited', 5);
    expect(f).toEqual({ ok: false, error: { code: 'upload.rate_limited', retryAfterSeconds: 5 } });
    expect(isRouteFailure(f)).toBe(true);
    expect(isRouteFailure(json({}))).toBe(false);
    expect(isRouteFailure({ ok: true, value: 1 })).toBe(false);
    expect(isRouteFailure(null)).toBe(false);
  });
});

describe('access cookie', () => {
  const maxAge = String(ACCESS_COOKIE_TTL_MS / 1000);

  it('sets twa_access with the documented attributes', () => {
    expect(accessCookieHeader('v1.123.abc_-')).toBe(
      `twa_access=v1.123.abc_-; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    );
    expect(maxAge).toBe('604800');
  });

  it('refuses a token that would break the header', () => {
    expect(() => accessCookieHeader('a; Domain=evil')).toThrow();
    expect(() => accessCookieHeader('')).toThrow();
  });

  it('clears with Max-Age=0', () => {
    expect(clearedAccessCookieHeader()).toBe(
      'twa_access=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
    );
  });

  it('unlock and lock answers are 204 with the cookie header', () => {
    const granted = accessGrantedResponse('tok.1');
    expect(granted.status).toBe(204);
    expect(granted.headers.get('set-cookie')).toContain(`${ACCESS_COOKIE_NAME}=tok.1;`);
    const cleared = accessClearedResponse();
    expect(cleared.status).toBe(204);
    expect(cleared.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('reads the token from the Cookie header', () => {
    const h = (cookie?: string) => new Headers(cookie === undefined ? {} : { cookie });
    expect(readAccessToken(h('a=1; twa_access=v1.5.xyz; b=2'))).toBe('v1.5.xyz');
    expect(readAccessToken(h('twa_access=first; twa_access=second'))).toBe('first');
    expect(readAccessToken(h('xtwa_access=v1; other'))).toBeNull();
    expect(readAccessToken(h('twa_access='))).toBeNull();
    expect(readAccessToken(h('twa_access=has space'))).toBeNull();
    expect(readAccessToken(h())).toBeNull();
  });
});

describe('byte ranges', () => {
  it('parses the forms browsers send, and answers null for the rest', () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', 100)).toBe('unsatisfiable');
    for (const h of ['bytes=0-1,5-6', 'items=0-1', 'bytes=5-1', 'bytes=-', 'x']) {
      expect(parseByteRange(h, 100)).toBeNull();
    }
  });

  it('slices a chunked stream to the inclusive range', async () => {
    const chunks = [new Uint8Array([0, 1, 2]), new Uint8Array([3, 4, 5]), new Uint8Array([6, 7])];
    const source = new ReadableStream<Uint8Array>({
      start(c) {
        for (const x of chunks) c.enqueue(x);
        c.close();
      },
    });
    const out = new Uint8Array(await new Response(sliceStream(source, 2, 6)).arrayBuffer());
    expect([...out]).toEqual([2, 3, 4, 5, 6]);
  });
});
