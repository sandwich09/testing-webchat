import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/common/common.api';

import { lock, unlock } from './access.api';

function stubFetch(impl: () => Response) {
  const fn = vi.fn(() => Promise.resolve().then(impl));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function errorBody(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message: 'x', requestId: 'r1' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unlock', () => {
  it('posts the code as JSON and resolves on 204', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await expect(unlock(' abc ')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/access/unlock');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'abc' });
  });

  it('throws the server error code', async () => {
    stubFetch(() => errorBody('access.code_invalid', 401));
    await expect(unlock('bad')).rejects.toMatchObject({ code: 'access.code_invalid', status: 401 });
  });

  it('throws access.rate_limited on 429', async () => {
    stubFetch(() => errorBody('access.rate_limited', 429));
    await expect(unlock('bad')).rejects.toMatchObject({ code: 'access.rate_limited', status: 429 });
  });

  it('maps a network failure to client.network', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(unlock('abc')).rejects.toMatchObject({ code: 'client.network', status: 0 });
  });

  it('maps a reply that is not an error body to internal.unexpected', async () => {
    stubFetch(() => new Response('<html>Not found</html>', { status: 404 }));
    await expect(unlock('abc')).rejects.toMatchObject({ code: 'internal.unexpected', status: 404 });
    stubFetch(() => errorBody('no.such_code', 500));
    await expect(unlock('abc')).rejects.toMatchObject({ code: 'internal.unexpected', status: 500 });
  });

  it('rejects a code that is too long without a request', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    const error: unknown = await unlock('a'.repeat(201)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'request.invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('lock', () => {
  it('posts without a body and resolves on 204', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));
    await expect(lock()).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/access/lock');
    expect(init.body).toBeUndefined();
  });

  it('throws on 401', async () => {
    stubFetch(() => errorBody('access.unauthorized', 401));
    await expect(lock()).rejects.toMatchObject({ code: 'access.unauthorized', status: 401 });
  });
});
