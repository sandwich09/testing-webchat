import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/common/common.api';
import type { ContactDto, MessageDto, UploadTargetDto } from '@/contracts';

import {
  cancelUpload,
  getContact,
  getMessages,
  listContacts,
  markContactRead,
  notifyTyping,
  requestUpload,
  retryMessage,
  sendMessage,
  setContactAi,
  uploadToTarget,
} from './inbox.api';

const putMock = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob/client', () => ({ put: putMock }));

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

function call(n = 0): { url: string; method: string; body: unknown } {
  const args = fetchMock.mock.calls[n];
  if (args === undefined) throw new Error('no call');
  const init = args[1] ?? {};
  return {
    url: urlOf(args[0]),
    method: init.method ?? 'GET',
    body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
  };
}

const contact: ContactDto = {
  id: 'c/1',
  displayName: 'มะลิ',
  pictureUrl: null,
  followStatus: 'following',
  followedAt: null,
  aiEnabled: true,
  needsAdmin: false,
  needsAdminReason: null,
  aiReplying: false,
  unreadCount: 0,
  lastMessage: null,
  createdAt: '2026-11-18T07:00:00.000Z',
  updatedSeq: '3',
};
const detail = { ...contact, stats: { messageCount: 2, aiMessageCount: 1 } };
const message: MessageDto = {
  id: '019a0000-0000-7000-8000-000000000001',
  seq: '5',
  updatedSeq: '5',
  contactId: 'c/1',
  direction: 'outbound',
  author: 'admin',
  type: 'text',
  text: 'hi',
  media: null,
  sticker: null,
  otherKind: null,
  eventCode: null,
  quote: null,
  delivery: { status: 'sent', errorCode: null, retryExpiresAt: null },
  createdAt: '2026-11-18T07:00:00.000Z',
  sentAt: '2026-11-18T07:00:01.000Z',
};
const uploadId = 'A'.repeat(22);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  putMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contact endpoints', () => {
  it('re-exports listContacts from common', async () => {
    fetchMock.mockResolvedValue(
      json({
        contacts: [contact],
        before: null,
        hasMore: false,
        highWater: '3',
        counts: { all: 1, unread: 0, needsAdmin: 0 },
        lineConfigured: true,
      }),
    );
    await expect(listContacts({ filter: 'all' })).resolves.toMatchObject({ highWater: '3' });
  });

  it('getContact encodes the id and parses ContactDetailDto', async () => {
    fetchMock.mockResolvedValue(json(detail));
    await expect(getContact('c/1')).resolves.toEqual(detail);
    expect(call().url).toBe('/api/contacts/c%2F1');
  });

  it('getContact rejects a ContactDto without stats', async () => {
    fetchMock.mockResolvedValue(json(contact));
    await expect(getContact('c/1')).rejects.toMatchObject({ code: 'internal.unexpected' });
  });

  it('setContactAi sends PATCH { aiEnabled }', async () => {
    fetchMock.mockResolvedValue(json(contact));
    await setContactAi('c/1', false);
    expect(call()).toEqual({
      url: '/api/contacts/c%2F1',
      method: 'PATCH',
      body: { aiEnabled: false },
    });
  });

  it('markContactRead posts to .../read', async () => {
    fetchMock.mockResolvedValue(json(contact));
    await expect(markContactRead('c/1')).resolves.toEqual(contact);
    expect(call()).toMatchObject({ url: '/api/contacts/c%2F1/read', method: 'POST' });
  });

  it('notifyTyping posts to .../typing', async () => {
    fetchMock.mockResolvedValue(json({ shown: true }));
    await expect(notifyTyping('c/1')).resolves.toEqual({ shown: true });
    expect(call()).toMatchObject({ url: '/api/contacts/c%2F1/typing', method: 'POST' });
  });
});

describe('message endpoints', () => {
  const messagesPage = { messages: [message], hasOlder: true, hasMore: false, highWater: '5' };

  it('getMessages sends only the given query fields', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(messagesPage)));
    await getMessages('c/1', {});
    await getMessages('c/1', { afterUpdatedSeq: '15' });
    await getMessages('c/1', { beforeSeq: '4', limit: 20 });
    expect(call(0).url).toBe('/api/contacts/c%2F1/messages');
    expect(call(1).url).toBe('/api/contacts/c%2F1/messages?afterUpdatedSeq=15');
    expect(call(2).url).toBe('/api/contacts/c%2F1/messages?beforeSeq=4&limit=20');
  });

  it('sendMessage posts the body with the id made by the browser', async () => {
    fetchMock.mockResolvedValue(json(message));
    const body = { id: message.id, kind: 'text', text: 'hi' } as const;
    await expect(sendMessage('c/1', body)).resolves.toEqual(message);
    expect(call()).toEqual({ url: '/api/contacts/c%2F1/messages', method: 'POST', body });
  });

  it('retryMessage posts to .../messages/:messageId/retry', async () => {
    fetchMock.mockResolvedValue(json(message));
    await retryMessage('c/1', message.id);
    expect(call()).toMatchObject({
      url: `/api/contacts/c%2F1/messages/${message.id}/retry`,
      method: 'POST',
    });
  });
});

describe('upload endpoints', () => {
  const ticket = {
    uploadId,
    expiresAt: '2026-11-18T08:00:00.000Z',
    original: {
      strategy: 'http_put',
      url: '/api/local-storage/a?exp=1&sig=x',
      headers: { 'Content-Type': 'image/jpeg' },
      contentType: 'image/jpeg',
      maxSizeBytes: 100,
    },
    preview: {
      strategy: 'http_put',
      url: '/api/local-storage/b?exp=1&sig=y',
      headers: {},
      contentType: 'image/jpeg',
      maxSizeBytes: 100,
    },
  };

  it('requestUpload posts the body and parses the ticket', async () => {
    fetchMock.mockResolvedValue(json(ticket));
    const body = {
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: 10,
      preview: { contentType: 'image/jpeg', sizeBytes: 5 },
    } as const;
    await expect(requestUpload(body)).resolves.toEqual(ticket);
    expect(call()).toEqual({ url: '/api/uploads', method: 'POST', body });
  });

  it('cancelUpload sends DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(cancelUpload(uploadId)).resolves.toBeUndefined();
    expect(call()).toMatchObject({ url: `/api/uploads/${uploadId}`, method: 'DELETE' });
  });
});

// A fake XMLHttpRequest: the test decides how each request ends.
class FakeXhr {
  static last: FakeXhr | null = null;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  responseText = '';
  aborted = false;
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: unknown): void {
    this.body = body;
  }
  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }
  finish(status: number, responseText = ''): void {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

function lastXhr(): FakeXhr {
  if (FakeXhr.last === null) throw new Error('no xhr');
  return FakeXhr.last;
}

describe('uploadToTarget', () => {
  const httpTarget: UploadTargetDto = {
    strategy: 'http_put',
    url: '/api/local-storage/k?exp=1&sig=s',
    headers: { 'Content-Type': 'image/jpeg' },
    contentType: 'image/jpeg',
    maxSizeBytes: 100,
  };
  const blob = new Blob(['x']);

  beforeEach(() => {
    FakeXhr.last = null;
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('http_put: PUTs with the headers, reports progress and resolves on 200', async () => {
    const onProgress = vi.fn();
    const done = uploadToTarget(httpTarget, blob, {
      onProgress,
      signal: new AbortController().signal,
    });
    const xhr = lastXhr();
    expect(xhr).toMatchObject({ method: 'PUT', url: httpTarget.url, body: blob });
    expect(xhr.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
    xhr.finish(200, '{}');
    await expect(done).resolves.toBeUndefined();
    expect(onProgress.mock.calls).toEqual([[25], [null], [100]]);
  });

  it('http_put: a non-200 rejects with the code of the error body', async () => {
    const done = uploadToTarget(httpTarget, blob, {
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    lastXhr().finish(
      403,
      JSON.stringify({ error: { code: 'upload.expired', message: 'x', requestId: 'r' } }),
    );
    await expect(done).rejects.toMatchObject({ code: 'upload.expired', status: 403 });
  });

  it('http_put: a body that is not the envelope is internal.unexpected', async () => {
    const done = uploadToTarget(httpTarget, blob, {
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    lastXhr().finish(500, 'oops');
    await expect(done).rejects.toMatchObject({ code: 'internal.unexpected', status: 500 });
  });

  it('http_put: a network error is client.network', async () => {
    const done = uploadToTarget(httpTarget, blob, {
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    lastXhr().onerror?.();
    await expect(done).rejects.toMatchObject({ code: 'client.network' });
  });

  it('http_put: abort stops the request and rejects with the abort reason', async () => {
    const controller = new AbortController();
    const done = uploadToTarget(httpTarget, blob, {
      onProgress: vi.fn(),
      signal: controller.signal,
    });
    const reason = new DOMException('cancel', 'AbortError');
    controller.abort(reason);
    await expect(done).rejects.toBe(reason);
    expect(lastXhr().aborted).toBe(true);
  });

  it('http_put: an already aborted signal never opens a request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadToTarget(httpTarget, blob, { onProgress: vi.fn(), signal: controller.signal }),
    ).rejects.toBeInstanceOf(Error);
    expect(FakeXhr.last).toBeNull();
  });

  const blobTarget: UploadTargetDto = {
    strategy: 'vercel_blob_client',
    pathname: 'media/out/a.jpg',
    clientToken: 'vercel_blob_client_x',
    contentType: 'image/jpeg',
    maxSizeBytes: 100,
  };

  it('vercel_blob_client: calls put with the token, public access, content type and signal', async () => {
    putMock.mockImplementation(
      (_p: string, _b: Blob, opts: { onUploadProgress: (e: { percentage: number }) => void }) => {
        opts.onUploadProgress({ percentage: 42.4 });
        return Promise.resolve({});
      },
    );
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    await uploadToTarget(blobTarget, blob, { onProgress, signal });
    expect(putMock).toHaveBeenCalledWith('media/out/a.jpg', blob, {
      access: 'public',
      token: 'vercel_blob_client_x',
      contentType: 'image/jpeg',
      abortSignal: signal,
      onUploadProgress: expect.any(Function) as unknown,
    });
    expect(onProgress).toHaveBeenCalledWith(42);
  });

  it('vercel_blob_client: an SDK failure becomes an ApiError, an abort stays an abort', async () => {
    putMock.mockRejectedValue(new Error('blob down'));
    await expect(
      uploadToTarget(blobTarget, blob, {
        onProgress: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(ApiError);

    const controller = new AbortController();
    const reason = new DOMException('cancel', 'AbortError');
    putMock.mockImplementation(() => {
      controller.abort(reason);
      return Promise.reject(new Error('aborted'));
    });
    await expect(
      uploadToTarget(blobTarget, blob, { onProgress: vi.fn(), signal: controller.signal }),
    ).rejects.toBe(reason);
  });
});
