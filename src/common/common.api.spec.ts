import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  ApiError,
  apiFetch,
  apiFetchNoContent,
  errorCodeOf,
  getSettings,
  isClientError,
  listContacts,
  lock,
  setUnauthorizedHandler,
  shouldRetryQuery,
  uploadTimeoutMs,
} from './common.api';
import { CLIENT_REQUEST_TIMEOUT_MS } from './common.constants';
import {
  CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS,
  CLIENT_UPLOAD_MIN_BYTES_PER_SECOND,
} from '@/contracts';

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function errorBody(code: string, requestId = 'req-1') {
  return { error: { code, message: 'x', requestId } };
}

/** The URL and init of the n-th fetch call. */
const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

function call(n = 0): { url: string; init: RequestInit } {
  const args = fetchMock.mock.calls[n];
  if (args === undefined) throw new Error(`no fetch call ${String(n)}`);
  return { url: urlOf(args[0]), init: args[1] ?? {} };
}

const okSchema = z.strictObject({ ok: z.literal(true) });

const settings = {
  ai: {
    enabled: true,
    provider: 'claude',
    model: 'claude-sonnet-5-5',
    dailyBudgetUsd: '5.00',
    todayCostUsd: '0.000000',
    politeParticle: 'ค่ะ',
    instructions: '',
    name: null,
    answerMode: 'general',
  },
  guard: { enabled: false, topics: [], blockedToday: 0 },
  line: {
    configured: true,
    status: 'connected',
    botName: 'ร้านมะลิ',
    basicId: '@mali',
    channelId: null,
    secretStatus: 'no_channel_id',
    webhookUrl: 'https://example.test/api/line/webhook',
    lastWebhookAt: null,
  },
  richMenu: {
    published: false,
    publishedAt: null,
    lastError: null,
    howToText: '',
    howToDefault: 'ลองได้ตามนี้เลยค่ะ',
  },
  welcome: { enabled: true, text: '', defaultText: 'ขอบคุณที่เพิ่มเพื่อน', accountName: 'Test webchat' },
  client: { pollIntervalMs: 2000 },
};

const contactsPage = {
  contacts: [],
  before: null,
  hasMore: false,
  highWater: '10',
  counts: { all: 0, unread: 0, needsAdmin: 0 },
  lineConfigured: true,
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch request', () => {
  it('sends same-origin credentials, no-store and the query without undefined values', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await apiFetch('/api/x', { query: { a: 'b c', n: 3, skip: undefined }, schema: okSchema });
    const { url, init } = call();
    expect(url).toBe('/api/x?a=b+c&n=3');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(init.body).toBeUndefined();
  });

  it('sends a JSON body with its content type', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await apiFetch('/api/x', { method: 'PATCH', body: { a: 1 }, schema: okSchema });
    const { init } = call();
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('sends FormData as is and lets the browser set the content type', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const form = new FormData();
    form.append('file', new Blob(['%PDF-']), 'a.pdf');
    await apiFetch('/api/x', { method: 'POST', body: form, schema: okSchema });
    expect(call().init.body).toBe(form);
    expect(call().init.headers).toBeUndefined();
  });
});

describe('apiFetch answers', () => {
  it('returns the parsed body', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    await expect(apiFetch('/api/x', { schema: okSchema })).resolves.toEqual({ ok: true });
  });

  it('turns a body that breaks the schema into internal.unexpected, not a crash', async () => {
    fetchMock.mockResolvedValue(json({ ok: 'yes' }, 200, { 'x-request-id': 'r9' }));
    const error = await apiFetch('/api/x', { schema: okSchema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'internal.unexpected', status: 200, requestId: 'r9' });
  });

  it('turns a 200 that is not JSON into internal.unexpected', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(apiFetch('/api/x', { schema: okSchema })).rejects.toMatchObject({
      code: 'internal.unexpected',
    });
  });

  it('reads code, status and requestId from the error body', async () => {
    fetchMock.mockResolvedValue(json(errorBody('message.rate_limited', 'req-7'), 429));
    await expect(apiFetch('/api/x', { schema: okSchema })).rejects.toMatchObject({
      code: 'message.rate_limited',
      status: 429,
      requestId: 'req-7',
    });
  });

  it('treats an error page that is not the envelope as internal.unexpected', async () => {
    fetchMock.mockResolvedValue(
      new Response('Bad gateway', { status: 502, headers: { 'x-request-id': 'r2' } }),
    );
    await expect(apiFetch('/api/x', { schema: okSchema })).rejects.toMatchObject({
      code: 'internal.unexpected',
      status: 502,
      requestId: 'r2',
    });
  });

  it('gives client.network when the request gets no answer', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/api/x', { schema: okSchema })).rejects.toMatchObject({
      code: 'client.network',
      status: 0,
    });
  });

  it('gives client.network when CLIENT_REQUEST_TIMEOUT_MS passes', async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('timed out', 'TimeoutError'));
          });
        }),
    );
    const pending = apiFetch('/api/x', { schema: okSchema });
    timeout.abort();
    await expect(pending).rejects.toMatchObject({ code: 'client.network' });
  });

  it('waits CLIENT_REQUEST_TIMEOUT_MS by default, the given time per call, and without limit on null', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockImplementation(() => Promise.resolve(json({ ok: true })));

    await apiFetch('/api/x', { schema: okSchema });
    await apiFetch('/api/x', { schema: okSchema, timeoutMs: CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS });
    await apiFetch('/api/x', { schema: okSchema, timeoutMs: null });

    expect(timeout.mock.calls).toEqual([
      [CLIENT_REQUEST_TIMEOUT_MS],
      [CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS],
    ]);
  });

  it('gives an upload the default plus the file at the slowest expected rate', () => {
    expect(uploadTimeoutMs(0)).toBe(CLIENT_REQUEST_TIMEOUT_MS);
    expect(uploadTimeoutMs(CLIENT_UPLOAD_MIN_BYTES_PER_SECOND * 10)).toBe(
      CLIENT_REQUEST_TIMEOUT_MS + 10_000,
    );
  });

  it('rethrows the abort reason when the caller cancels, so it is not counted as a failure', async () => {
    const caller = new AbortController();
    const reason = new DOMException('cancelled', 'AbortError');
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const pending = apiFetch('/api/x', { schema: okSchema, signal: caller.signal });
    caller.abort(reason);
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBe(reason);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('resolves a 204 without reading a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetchNoContent('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(call().init.method).toBe('DELETE');
  });

  it('rejects a failed call without content as well', async () => {
    fetchMock.mockResolvedValue(json(errorBody('knowledge.not_found'), 404));
    await expect(apiFetchNoContent('/api/x')).rejects.toMatchObject({
      code: 'knowledge.not_found',
      status: 404,
    });
  });
});

describe('401 handling', () => {
  it('runs the handler once however many requests come back 401', async () => {
    const handler = vi.fn();
    const remove = setUnauthorizedHandler(handler);
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(errorBody('access.unauthorized'), 401)),
    );
    const results = await Promise.allSettled([
      apiFetch('/api/a', { schema: okSchema }),
      apiFetch('/api/b', { schema: okSchema }),
      apiFetchNoContent('/api/c', { method: 'POST' }),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    remove();
  });

  it('re-arms when a handler is registered again, and a removed handler is not called', async () => {
    const first = vi.fn();
    const removeFirst = setUnauthorizedHandler(first);
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(errorBody('access.unauthorized'), 401)),
    );
    await apiFetchNoContent('/api/a').catch(() => undefined);
    removeFirst();
    await apiFetchNoContent('/api/a').catch(() => undefined);
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    const removeSecond = setUnauthorizedHandler(second);
    await apiFetchNoContent('/api/a').catch(() => undefined);
    expect(second).toHaveBeenCalledTimes(1);
    removeSecond();
  });

  it('does not run the handler for other statuses', async () => {
    const handler = vi.fn();
    const remove = setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(json(errorBody('request.origin_forbidden'), 403));
    await apiFetchNoContent('/api/a').catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();
    remove();
  });
});

describe('error helpers', () => {
  it('isClientError is true only for 4xx ApiErrors', () => {
    expect(isClientError(new ApiError('contact.not_found', 404))).toBe(true);
    expect(isClientError(new ApiError('internal.unexpected', 500))).toBe(false);
    expect(isClientError(new ApiError('client.network', 0))).toBe(false);
    expect(isClientError(new Error('x'))).toBe(false);
  });

  it('errorCodeOf maps unknown errors to internal.unexpected', () => {
    expect(errorCodeOf(new ApiError('client.network', 0))).toBe('client.network');
    expect(errorCodeOf(new Error('boom'))).toBe('internal.unexpected');
  });

  it('shouldRetryQuery retries once and never after a 4xx', () => {
    expect(shouldRetryQuery(0, new ApiError('internal.unexpected', 500))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError('client.network', 0))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError('internal.unexpected', 500))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError('contact.not_found', 404))).toBe(false);
  });
});

describe('shared endpoints', () => {
  it('getSettings parses GET /api/settings', async () => {
    fetchMock.mockResolvedValue(json(settings));
    await expect(getSettings()).resolves.toEqual(settings);
    expect(call().url).toBe('/api/settings');
  });

  it('getSettings rejects a body that leaks a field the contract does not have', async () => {
    fetchMock.mockResolvedValue(json({ ...settings, line: { ...settings.line, secret: 's' } }));
    await expect(getSettings()).rejects.toMatchObject({ code: 'internal.unexpected' });
  });

  it('listContacts in page mode sends filter, q and before, and leaves out an empty q', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(contactsPage)));
    await listContacts({ filter: 'unread', q: 'มะลิ', before: 'abc_-' });
    await listContacts({ filter: 'all', q: '' });
    expect(call(0).url).toBe(
      `/api/contacts?filter=unread&q=${encodeURIComponent('มะลิ')}&before=abc_-`,
    );
    expect(call(1).url).toBe('/api/contacts?filter=all');
  });

  it('listContacts in polling mode sends afterUpdatedSeq alone', async () => {
    fetchMock.mockResolvedValue(json(contactsPage));
    await expect(listContacts({ afterUpdatedSeq: '5' })).resolves.toEqual(contactsPage);
    expect(call().url).toBe('/api/contacts?afterUpdatedSeq=5');
  });

  it('lock posts to /api/access/lock and resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(lock()).resolves.toBeUndefined();
    expect(call().url).toBe('/api/access/lock');
    expect(call().init.method).toBe('POST');
  });
});
