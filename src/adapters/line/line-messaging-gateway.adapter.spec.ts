import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LineAccessToken, LineMessageId, LineUserId, OutboundLinePart } from '@/core/domain';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, buildWelcomeCard, richMenuSpec } from '@/core/domain';
import { describeMessagingGatewaySuite, type MessagingGatewayHarness } from '@/adapters/fakes';
import { ADAPTER_TEST_STUB_URL } from '../../../test-support/adapters.constants';
import {
  STUB_CHANNEL_ACCESS_TOKEN,
  STUB_OTHER_CHANNEL_ACCESS_TOKEN,
  STUB_CHANNEL_ID,
  STUB_CHANNEL_SECRET,
} from '../../../e2e/fixtures/line/credentials';
import { newFixtureVars, renderFixture } from '../../../e2e/helpers/line-webhook';
import {
  LINE_MAX_RETRIES,
  LINE_PROFILE_TIMEOUT_MS,
  LINE_REQUEST_TIMEOUT_MS,
} from './line.constants';
import { toFlexWelcome, toLineRichMenu } from './line-flex.mapper';
import type { FetchFn } from './line-http';
import { RICH_MENU_IMAGE_PNG_BASE64 } from './rich-menu-image.generated';
import {
  createLineMessagingGateway,
  LineContentTooLargeError,
  sentIdsOf,
  toLineRetryKey,
} from './line-messaging-gateway.adapter';

// Runs against the LINE stub (docs/qa/stubs-and-fixtures.md section 4). The stub has no control
// route that seeds content bytes, so the suite's `seedContent` cases use a small content server
// in this file that applies the stub's auth rules; the stub's own content routes are covered in
// "LINE stub content" below.

const STUB = ADAPTER_TEST_STUB_URL;
const TOKEN = STUB_CHANNEL_ACCESS_TOKEN as LineAccessToken;
const INVALID_TOKEN = 'stub-invalid-token' as LineAccessToken;
const hex = (): string => randomBytes(16).toString('hex');
const newUser = (): LineUserId => `U${hex()}` as LineUserId;
const text = (value: string): OutboundLinePart[] => [{ type: 'text', text: value }];

interface Recorded {
  seq: number;
  endpoint: string;
  path: string;
  status: number;
  headers: { authorization: string; xLineRetryKey?: string; contentType?: string };
  body: unknown;
}

const control = async (path: string, body: unknown): Promise<void> => {
  const res = await fetch(`${STUB}/__control${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`stub control ${path} answered ${String(res.status)}`);
};

const recorded = async (query: { endpoint?: string; to?: string }): Promise<Recorded[]> => {
  const params = new URLSearchParams(query);
  const res = await fetch(`${STUB}/__control/line/requests?${params.toString()}`);
  return ((await res.json()) as { items: Recorded[] }).items;
};

const failNext = (o: {
  endpoint: string;
  match?: Record<string, string>;
  preset?: 'invalid_reply_token' | 'validation';
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  times?: number;
}): Promise<void> => control('/line/fail-next', o);

const readAll = async (
  stream: ReadableStream<Uint8Array>,
  onChunk: (size: number) => void = () => undefined,
): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(value.length);
    chunks.push(value);
  }
  return Buffer.concat(chunks);
};

// --- content server for the suite's seedContent ------------------------------------------------

interface Seeded {
  original: Uint8Array;
  preview?: Uint8Array;
  contentType: string;
  knownSize: boolean;
  /** "Not ready" answers left: a 202 of the original or a `processing` status uses one. */
  notReadyTimes?: number;
}

const takeNotReady = (item: Seeded): boolean => {
  if (item.notReadyTimes === undefined || item.notReadyTimes <= 0) return false;
  item.notReadyTimes -= 1;
  return true;
};
const seeded = new Map<string, Seeded>();
let contentServer: Server;
let contentBase = '';

/** Rich menu pictures go to the stub's data host: the suite's data base is this server. */
const forwardToStub = (req: IncomingMessage, res: ServerResponse): void => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    void fetch(`${STUB}${req.url ?? ''}`, {
      method: req.method,
      headers: {
        authorization: req.headers.authorization ?? '',
        'content-type': req.headers['content-type'] ?? '',
      },
      body: Buffer.concat(chunks),
    }).then(async (answer) => {
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(Buffer.from(await answer.arrayBuffer()));
    });
  });
};

const startContentServer = (): Promise<void> =>
  new Promise((resolve) => {
    contentServer = createServer((req, res) => {
      const auth = req.headers.authorization ?? '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!/^Bearer\s+\S+/i.test(auth) || token === INVALID_TOKEN) {
        res.writeHead(401, { 'content-type': 'application/json' }).end('{"message":"auth"}');
        return;
      }
      if ((req.url ?? '').startsWith('/line-data/v2/bot/richmenu/')) {
        forwardToStub(req, res);
        return;
      }
      const m = /^\/line-data\/v2\/bot\/message\/([^/]+)\/content(\/preview|\/transcoding)?$/.exec(
        req.url ?? '',
      );
      const item = m?.[1] === undefined ? undefined : seeded.get(m[1]);
      if (item !== undefined && m?.[2] === '/transcoding') {
        const status = takeNotReady(item) ? 'processing' : 'succeeded';
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status }));
        return;
      }
      if (item !== undefined && m?.[2] === undefined && takeNotReady(item)) {
        res.writeHead(202, { 'content-type': 'application/json' }).end('{}');
        return;
      }
      const bytes = m?.[2] === undefined ? item?.original : item?.preview;
      if (item === undefined || bytes === undefined) {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"message":"Not found"}');
        return;
      }
      const headers: Record<string, string> = { 'content-type': item.contentType };
      if (item.knownSize) headers['content-length'] = String(bytes.length);
      res.writeHead(200, headers);
      for (let i = 0; i < bytes.length; i += 512) res.write(bytes.subarray(i, i + 512));
      res.end();
    });
    contentServer.listen(0, '127.0.0.1', () => {
      contentBase = `http://127.0.0.1:${String((contentServer.address() as AddressInfo).port)}`;
      resolve();
    });
  });

beforeAll(async () => {
  const health = await fetch(`${STUB}/__control/health`).catch(() => null);
  if (health?.ok !== true) throw new Error(`LINE stub is not reachable at ${STUB}`);
  await control('/reset', {});
  await startContentServer();
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      contentServer.close(() => {
        resolve();
      });
    }),
);

const noSleep = { calls: [] as number[] };
const gatewayFor = (opts: { dataBase?: string; fetch?: FetchFn } = {}) =>
  createLineMessagingGateway({
    apiBaseUrl: `${STUB}/line`,
    dataApiBaseUrl: opts.dataBase ?? `${STUB}/line-data`,
    fetch: opts.fetch,
    sleep: (ms) => {
      noSleep.calls.push(ms);
      return Promise.resolve();
    },
  });

// --- the port suite ----------------------------------------------------------------------------

const makeHarness = async (): Promise<MessagingGatewayHarness> => {
  const knownUserId = newUser();
  await control('/line/profiles', {
    userId: knownUserId,
    displayName: 'ลูกค้าทดสอบ',
    pictureUrl: null,
  });
  return {
    gateway: gatewayFor({ dataBase: `${contentBase}/line-data` }),
    channelSecret: STUB_CHANNEL_SECRET,
    validToken: TOKEN,
    invalidToken: INVALID_TOKEN,
    otherChannelToken: STUB_OTHER_CHANNEL_ACCESS_TOKEN as LineAccessToken, // brand: stub token
    knownUserId,
    unknownUserId: `Unoprofile${hex()}` as LineUserId,
    freshReplyToken: () => Promise.resolve(hex()),
    invalidReplyToken: `expired-${hex()}`,
    seedContent: (c) => {
      seeded.set(c.lineMessageId, { ...c });
      return Promise.resolve();
    },
    missingMessageId: `gone${hex()}` as LineMessageId,
    exhaustPushQuota: () =>
      failNext({
        endpoint: 'push',
        match: { to: knownUserId },
        status: 429,
        body: { message: 'You have reached your monthly limit.' },
        times: 1000,
      }),
    deliveredPushCount: async (to) =>
      (await recorded({ endpoint: 'push', to })).filter((r) => r.status === 200).length,
    channelId: STUB_CHANNEL_ID,
    failNextSecretCheck: () =>
      failNext({ endpoint: 'oauth-token', match: { channelId: STUB_CHANNEL_ID }, status: 503 }),
    richMenuState: async () => {
      const res = await fetch(`${STUB}/__control/line/rich-menus`);
      const state = (await res.json()) as {
        menus: { richMenuId: string }[];
        defaultRichMenuId: string | null;
      };
      return { ids: state.menus.map((m) => m.richMenuId), defaultId: state.defaultRichMenuId };
    },
  };
};

describeMessagingGatewaySuite(makeHarness);

// --- LINE-specific behaviour against the stub ---------------------------------------------------

/** A fetch whose first call reaches LINE but then loses the response, like a dropped connection. */
const losesFirstResponse = (): FetchFn => {
  let calls = 0;
  return async (input, init) => {
    calls += 1;
    const res = await fetch(input, init);
    if (calls === 1) {
      await res.body?.cancel();
      throw new TypeError('fetch failed');
    }
    return res;
  };
};

describe('LINE adapter: push', () => {
  it('sends the same X-Line-Retry-Key on every attempt, including retries', async () => {
    const to = newUser();
    const key = randomUUID();
    await failNext({ endpoint: 'push', match: { to }, status: 500, times: 2 });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), key);
    expect(result).toMatchObject({ ok: true, value: { alreadyAccepted: false } });
    // The stub answers sentMessages with one id per message, as LINE does.
    expect(result.ok ? result.value.sentIds : []).toHaveLength(1);
    const pushes = await recorded({ endpoint: 'push', to });
    const header = toLineRetryKey(key);
    expect(pushes.map((p) => [p.status, p.headers.xLineRetryKey])).toEqual([
      [500, header],
      [500, header],
      [200, header],
    ]);
    expect(pushes[0]?.body).toEqual({ to, messages: [{ type: 'text', text: 'hi' }] });
    expect(pushes[0]?.headers.authorization).toBe('bearer');
  });

  it('counts a 409 on a retry after a lost response as accepted, delivering once', async () => {
    const to = newUser();
    const result = await gatewayFor({ fetch: losesFirstResponse() }).push(
      TOKEN,
      to,
      text('hi'),
      randomUUID(),
    );
    expect(result).toEqual({ ok: true, value: { alreadyAccepted: true, sentIds: [] } });
    const pushes = await recorded({ endpoint: 'push', to });
    expect(pushes.map((p) => p.status)).toEqual([200, 409]);
  });

  it('does not treat a 409 without x-line-accepted-request-id as accepted', async () => {
    const to = newUser();
    await failNext({ endpoint: 'push', match: { to }, status: 409, body: { message: 'Conflict' } });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result).toMatchObject({ ok: false, error: { code: 'line.push_failed' } });
  });

  it('gives up after LINE_MAX_RETRIES retries of 5xx with line.unavailable', async () => {
    const to = newUser();
    await failNext({ endpoint: 'push', match: { to }, status: 503, times: 5 });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
    expect(await recorded({ endpoint: 'push', to })).toHaveLength(LINE_MAX_RETRIES + 1);
  });

  it('honours Retry-After on 429 and then succeeds', async () => {
    const to = newUser();
    await failNext({
      endpoint: 'push',
      match: { to },
      status: 429,
      body: { message: 'The API rate limit has been exceeded. Try again later.' },
      headers: { 'retry-after': '2' },
    });
    noSleep.calls.length = 0;
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result).toMatchObject({ ok: true, value: { alreadyAccepted: false } });
    expect(noSleep.calls).toEqual([2000]);
  });

  it('returns line.rate_limited with retryAfterSeconds when LINE asks for a long wait', async () => {
    const to = newUser();
    await failNext({
      endpoint: 'push',
      match: { to },
      status: 429,
      body: { message: 'The API rate limit has been exceeded. Try again later.' },
      headers: { 'retry-after': '60' },
    });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result).toEqual({
      ok: false,
      error: { code: 'line.rate_limited', detail: 'LINE answered 429', retryAfterSeconds: 60 },
    });
    expect(await recorded({ endpoint: 'push', to })).toHaveLength(1);
  });

  it('does not retry the monthly quota error', async () => {
    const to = newUser();
    await failNext({
      endpoint: 'push',
      match: { to },
      status: 429,
      body: { message: 'You have reached your monthly limit.' },
      times: 3,
    });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result).toMatchObject({ ok: false, error: { code: 'line.quota_exceeded' } });
    expect(await recorded({ endpoint: 'push', to })).toHaveLength(1);
  });

  it('never retries a 4xx', async () => {
    const to = newUser();
    await failNext({ endpoint: 'push', match: { to }, status: 400, times: 3 });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result).toMatchObject({ ok: false, error: { code: 'line.push_failed' } });
    expect(await recorded({ endpoint: 'push', to })).toHaveLength(1);
  });

  it('sends image and video parts in the LINE message shape', async () => {
    const to = newUser();
    const parts: OutboundLinePart[] = [
      {
        type: 'image',
        originalUrl: 'https://cdn.test/a.jpg',
        previewUrl: 'https://cdn.test/a-p.jpg',
      },
      {
        type: 'video',
        originalUrl: 'https://cdn.test/v.mp4',
        previewUrl: 'https://cdn.test/v.jpg',
      },
    ];
    expect((await gatewayFor().push(TOKEN, to, parts, randomUUID())).ok).toBe(true);
    const [push] = await recorded({ endpoint: 'push', to });
    expect(push?.body).toEqual({
      to,
      messages: [
        {
          type: 'image',
          originalContentUrl: 'https://cdn.test/a.jpg',
          previewImageUrl: 'https://cdn.test/a-p.jpg',
        },
        {
          type: 'video',
          originalContentUrl: 'https://cdn.test/v.mp4',
          previewImageUrl: 'https://cdn.test/v.jpg',
        },
      ],
    });
  });

  it('never puts the access token in an error detail', async () => {
    const to = newUser();
    await failNext({ endpoint: 'push', match: { to }, status: 401 });
    const result = await gatewayFor().push(TOKEN, to, text('hi'), randomUUID());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe('LINE adapter: parseEvents', () => {
  it('batch-with-malformed gives three events, the second unsupported', () => {
    const vars = newFixtureVars();
    const result = gatewayFor().parseEvents(renderFixture('batch-with-malformed', vars));
    expect(result.ok && result.value.map((e) => e.kind)).toEqual([
      'message',
      'unsupported',
      'message',
    ]);
  });

  it('message-text-quote carries the quoted LINE message id', () => {
    const vars = newFixtureVars({ quotedMessageId: '468789577898262530' });
    const result = gatewayFor().parseEvents(renderFixture('message-text-quote', vars));
    const [event] = result.ok ? result.value : [];
    expect(event?.kind === 'message' && event.message).toEqual({
      type: 'text',
      lineMessageId: vars.messageId,
      text: 'hello',
      quotedLineMessageId: '468789577898262530',
    });
  });

  it('leaves out an event without webhookEventId', () => {
    const result = gatewayFor().parseEvents(JSON.stringify({ events: [{ type: 'follow' }] }));
    expect(result).toEqual({ ok: true, value: [] });
  });
});

describe('sentIdsOf', () => {
  it('reads the ids of sentMessages in order and skips entries without a string id', () => {
    expect(sentIdsOf({ sentMessages: [{ id: '1', quoteToken: 'q' }, { id: '2' }] })).toEqual([
      '1',
      '2',
    ]);
    expect(sentIdsOf({ sentMessages: [{ id: 3 }, {}, null, { id: '' }, { id: '4' }] })).toEqual([
      '4',
    ]);
  });

  it('gives no ids for a body without sentMessages', () => {
    for (const body of [null, undefined, 'x', {}, { sentMessages: 'x' }, []]) {
      expect(sentIdsOf(body)).toEqual([]);
    }
  });
});

describe('toLineRetryKey', () => {
  const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const MESSAGE_ID = '019a8f6e-4b2c-7d10-8a3b-5c6d7e8f9a0b'; // a UUIDv7, as message ids are

  it('maps every key, UUIDv7 message ids included, to a version-5 UUID with the RFC 4122 variant', () => {
    for (const key of [MESSAGE_ID, randomUUID(), 'rk-1']) {
      const mapped = toLineRetryKey(key);
      expect(mapped).toMatch(V5);
      expect(mapped).not.toBe(key);
    }
  });

  it('is the first 16 bytes of SHA-256 of the key with the version and variant bits set', () => {
    expect(toLineRetryKey(MESSAGE_ID)).toBe(toLineRetryKey(MESSAGE_ID));
    expect(toLineRetryKey('rk-1')).not.toBe(toLineRetryKey('rk-2'));
    // Fixed value: a change of the derivation would change every key LINE has already seen.
    expect(toLineRetryKey(MESSAGE_ID)).toBe('83d5f8df-0164-53d1-93a6-d4befa9b625b');
  });

  it('is accepted by the stub, which takes version 4 and 5 keys only', async () => {
    const to = newUser();
    expect(await gatewayFor().push(TOKEN, to, text('hi'), MESSAGE_ID)).toMatchObject({
      ok: true,
      value: { alreadyAccepted: false },
    });
    const [push] = await recorded({ endpoint: 'push', to });
    expect(push?.headers.xLineRetryKey).toBe(toLineRetryKey(MESSAGE_ID));
  });
});

describe('LINE adapter: reply', () => {
  it('sends every part in one request with the reply token', async () => {
    const replyToken = hex();
    const result = await gatewayFor().reply(TOKEN, replyToken, [
      { type: 'text', text: 'หนึ่ง' },
      { type: 'text', text: 'สอง' },
    ]);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.sentIds : []).toHaveLength(2);
    const items = (await recorded({ endpoint: 'reply' })).filter(
      (r) => (r.body as { replyToken?: string }).replyToken === replyToken,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.body).toEqual({
      replyToken,
      messages: [
        { type: 'text', text: 'หนึ่ง' },
        { type: 'text', text: 'สอง' },
      ],
    });
  });

  it('returns line.unavailable, not reply_token_invalid, when a retry finds the token used', async () => {
    // The first attempt was delivered but its answer was lost; pushing now would send twice.
    const result = await gatewayFor({ fetch: losesFirstResponse() }).reply(TOKEN, hex(), text('x'));
    expect(result).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
  });

  it('returns line.unavailable after retrying 5xx', async () => {
    const replyToken = hex();
    await failNext({ endpoint: 'reply', match: { replyToken }, status: 500, times: 5 });
    const result = await gatewayFor().reply(TOKEN, replyToken, text('x'));
    expect(result).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
  });

  it('returns reply_token_invalid only for a 400 whose message says the token is invalid', async () => {
    const used = hex();
    expect((await gatewayFor().reply(TOKEN, used, text('one'))).ok).toBe(true);
    // The stub answers a used token with {"message":"Invalid reply token"}.
    expect(await gatewayFor().reply(TOKEN, used, text('two'))).toMatchObject({
      ok: false,
      error: { code: 'line.reply_token_invalid' },
    });
    const token = hex();
    await failNext({
      endpoint: 'reply',
      match: { replyToken: token },
      preset: 'invalid_reply_token',
    });
    expect(await gatewayFor().reply(TOKEN, token, text('x'))).toMatchObject({
      ok: false,
      error: { code: 'line.reply_token_invalid' },
    });
  });

  it('returns line.reply_failed for a validation 400, which a push of the same payload would repeat', async () => {
    const replyToken = hex();
    await failNext({ endpoint: 'reply', match: { replyToken }, preset: 'validation' });
    const result = await gatewayFor().reply(TOKEN, replyToken, text('x'));
    expect(result).toMatchObject({ ok: false, error: { code: 'line.reply_failed' } });
    // A 400 without a message is not about the token either.
    const other = hex();
    await failNext({ endpoint: 'reply', match: { replyToken: other }, status: 400, body: {} });
    expect(await gatewayFor().reply(TOKEN, other, text('x'))).toMatchObject({
      ok: false,
      error: { code: 'line.reply_failed' },
    });
  });

  it('keeps reply_token_invalid after retries that LINE definitely refused (429)', async () => {
    const replyToken = `expired-${hex()}`;
    await failNext({ endpoint: 'reply', match: { replyToken }, status: 429 });
    const result = await gatewayFor().reply(TOKEN, replyToken, text('x'));
    expect(result).toMatchObject({ ok: false, error: { code: 'line.reply_token_invalid' } });
  });
});

describe('LINE adapter: getProfile', () => {
  it('returns pictureUrl null when LINE sends none', async () => {
    const userId = newUser();
    await control('/line/profiles', { userId, displayName: 'สมหญิง', pictureUrl: null });
    expect(await gatewayFor().getProfile(TOKEN, userId)).toEqual({
      ok: true,
      value: { displayName: 'สมหญิง', pictureUrl: null },
    });
  });

  it('does not retry a 5xx', async () => {
    const userId = newUser();
    await failNext({ endpoint: 'profile', match: { userId }, status: 500, times: 3 });
    const result = await gatewayFor().getProfile(TOKEN, userId);
    expect(result).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
    expect(await recorded({ endpoint: 'profile', to: userId })).toHaveLength(1);
  });

  it('gives up after LINE_PROFILE_TIMEOUT_MS with line.profile_unavailable and no retry', async () => {
    const userId = newUser();
    await control('/line/delay-next', {
      endpoint: 'profile',
      match: { userId },
      ms: LINE_PROFILE_TIMEOUT_MS + 1500,
      times: 3,
    });
    const started = performance.now();
    const result = await gatewayFor().getProfile(TOKEN, userId);
    const elapsed = performance.now() - started;
    expect(result).toMatchObject({ ok: false, error: { code: 'line.profile_unavailable' } });
    expect(elapsed).toBeGreaterThanOrEqual(LINE_PROFILE_TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(LINE_REQUEST_TIMEOUT_MS);
    expect(await recorded({ endpoint: 'profile', to: userId })).toHaveLength(1);
  });

  it('refuses a user id that could change the request path, without calling LINE', async () => {
    const result = await gatewayFor().getProfile(TOKEN, '../info' as LineUserId);
    expect(result).toMatchObject({ ok: false, error: { code: 'line.profile_unavailable' } });
  });
});

describe('LINE stub content', () => {
  const idOf = (prefix: string): LineMessageId => `${prefix}${hex()}` as LineMessageId;

  it('downloads an image from the data host with its type and size', async () => {
    const id = idOf('img');
    const result = await gatewayFor().downloadContent(TOKEN, id, 'original', IMAGE_MAX_BYTES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.contentType).toBe('image/jpeg');
    const bytes = await readAll(result.value.stream);
    expect(bytes.length).toBe(result.value.sizeBytes);
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    const [req] = (await recorded({ endpoint: 'content' })).filter((r) => r.path.includes(id));
    expect(req?.path).toBe(`/line-data/v2/bot/message/${id}/content`);
  });

  it('downloads the video preview from content/preview', async () => {
    const id = idOf('vid');
    const result = await gatewayFor().downloadContent(TOKEN, id, 'preview', IMAGE_MAX_BYTES);
    expect(result.ok && result.value.contentType).toBe('image/jpeg');
    if (result.ok) await readAll(result.value.stream);
    const items = (await recorded({ endpoint: 'content-preview' })).filter((r) =>
      r.path.includes(id),
    );
    expect(items).toHaveLength(1);
  });

  it.each([
    ['bigimg', IMAGE_MAX_BYTES],
    ['bigvid', VIDEO_MAX_BYTES],
  ])('%s: the stream fails with media.too_large without passing the cap', async (prefix, max) => {
    const result = await gatewayFor().downloadContent(TOKEN, idOf(prefix), 'original', max);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sizeBytes).toBeNull();
    let received = 0;
    let failure: unknown = null;
    try {
      await readAll(result.value.stream, (size) => {
        received += size;
      });
    } catch (e) {
      failure = e;
    }
    expect(failure).toBeInstanceOf(LineContentTooLargeError);
    expect(failure).toMatchObject({ code: 'media.too_large' });
    expect(received).toBeLessThanOrEqual(max);
  });

  it('returns media.too_large from Content-Length before reading the body', async () => {
    const result = await gatewayFor().downloadContent(TOKEN, idOf('img'), 'original', 10);
    expect(result).toMatchObject({ ok: false, error: { code: 'media.too_large' } });
  });

  it.each([
    ['404', 'gone', undefined],
    ['410', 'img', 410],
  ])('returns line.content_unavailable for %s', async (_name, prefix, status) => {
    const id = idOf(prefix);
    if (status !== undefined)
      await failNext({ endpoint: 'content', match: { messageId: id }, status });
    const result = await gatewayFor().downloadContent(TOKEN, id, 'original', IMAGE_MAX_BYTES);
    expect(result).toMatchObject({ ok: false, error: { code: 'line.content_unavailable' } });
  });

  it('answers line.content_not_ready while the stub transcodes, and reports the status', async () => {
    const id = idOf('vid');
    await control('/line/transcoding', { messageId: id, notReadyTimes: 2 });
    const first = await gatewayFor().downloadContent(TOKEN, id, 'original', VIDEO_MAX_BYTES);
    expect(first).toMatchObject({ ok: false, error: { code: 'line.content_not_ready' } });
    expect(await gatewayFor().getContentStatus(TOKEN, id)).toEqual({
      ok: true,
      value: 'processing',
    });
    expect(await gatewayFor().getContentStatus(TOKEN, id)).toEqual({
      ok: true,
      value: 'succeeded',
    });
    const ready = await gatewayFor().downloadContent(TOKEN, id, 'original', VIDEO_MAX_BYTES);
    expect(ready.ok).toBe(true);
    if (ready.ok) expect((await readAll(ready.value.stream)).length).toBe(ready.value.sizeBytes);
    const statuses = (await recorded({ endpoint: 'content' }))
      .filter((r) => r.path.includes(id))
      .map((r) => r.status);
    expect(statuses).toEqual([202, 200]);
    const [poll] = (await recorded({ endpoint: 'content-transcoding' })).filter((r) =>
      r.path.includes(id),
    );
    expect(poll?.path).toBe(`/line-data/v2/bot/message/${id}/content/transcoding`);
  });

  it('treats any 2xx but 200 as not ready and never reads it as the file', async () => {
    const id = idOf('img');
    await failNext({ endpoint: 'content', match: { messageId: id }, status: 204 });
    const result = await gatewayFor().downloadContent(TOKEN, id, 'original', IMAGE_MAX_BYTES);
    expect(result).toMatchObject({ ok: false, error: { code: 'line.content_not_ready' } });
  });

  it('reports a failed transcoding', async () => {
    const id = idOf('vid');
    await control('/line/transcoding', { messageId: id, failed: true });
    expect(await gatewayFor().getContentStatus(TOKEN, id)).toEqual({ ok: true, value: 'failed' });
  });

  it('retries a 5xx download and then streams it', async () => {
    const id = idOf('img');
    await failNext({ endpoint: 'content', match: { messageId: id }, status: 502 });
    const result = await gatewayFor().downloadContent(TOKEN, id, 'original', IMAGE_MAX_BYTES);
    expect(result.ok).toBe(true);
    if (result.ok) await readAll(result.value.stream);
  });

  it('refuses a message id that could leave the content path, without calling LINE', async () => {
    const calls: string[] = [];
    const spy: FetchFn = (input, init) => {
      calls.push(input);
      return fetch(input, init);
    };
    const gateway = gatewayFor({ fetch: spy });
    for (const id of ['../../info', 'a/b', '%2e%2e', 'x?y=1', '']) {
      const result = await gateway.downloadContent(TOKEN, id as LineMessageId, 'original', 100);
      expect(result).toMatchObject({ ok: false, error: { code: 'line.content_unavailable' } });
    }
    expect(calls).toEqual([]);
  });

  it('does not follow a redirect away from the data host', async () => {
    const id = idOf('img');
    await failNext({
      endpoint: 'content',
      match: { messageId: id },
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    });
    const result = await gatewayFor().downloadContent(TOKEN, id, 'original', IMAGE_MAX_BYTES);
    expect(result).toMatchObject({ ok: false, error: { code: 'line.content_unavailable' } });
    const items = (await recorded({ endpoint: 'content' })).filter((r) => r.path.includes(id));
    expect(items).toHaveLength(1);
  });
});

describe('LINE adapter: verifyChannelSecret', () => {
  type FormCall = { url: string; body: string; headers: Record<string, string> };
  const recordingFetch =
    (calls: FormCall[]): FetchFn =>
    (input, init) => {
      calls.push({
        url: input,
        body: typeof init.body === 'string' ? init.body : '',
        headers: init.headers as Record<string, string>, // set as a plain object by the adapter
      });
      return fetch(input, init);
    };

  it('asks for a client-credentials token as form fields, reads its bot, and revokes it at once', async () => {
    const calls: FormCall[] = [];
    const result = await gatewayFor({ fetch: recordingFetch(calls) }).verifyChannelSecret(
      STUB_CHANNEL_ID,
      STUB_CHANNEL_SECRET,
    );
    expect(result).toEqual({
      ok: true,
      value: { bot: { botUserId: 'Ustub00000000000000000000000000000', basicId: '@000stub' } },
    });
    expect(calls.map((c) => c.url)).toEqual([
      `${STUB}/line/v2/oauth/accessToken`,
      `${STUB}/line/v2/bot/info`,
      `${STUB}/line/v2/oauth/revoke`,
    ]);
    // The bot is read with the token LINE just issued, never with another one.
    expect(
      String(calls[1]?.headers['authorization'] ?? calls[1]?.headers['Authorization']),
    ).toMatch(/^Bearer stub-issued-/);
    const form = new URLSearchParams(calls[0]?.body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'client_credentials',
      client_id: STUB_CHANNEL_ID,
      client_secret: STUB_CHANNEL_SECRET,
    });
    expect(calls[0]?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    // The stub answers 200 to a revoke only for a token it issued and has not revoked yet.
    const revokes = await recorded({ endpoint: 'oauth-revoke' });
    expect(revokes.at(-1)?.status).toBe(200);
    expect(new URLSearchParams(calls[2]?.body).get('access_token')).toMatch(/^stub-issued-/);
  });

  it('never records the secret or the issued token in what the stub keeps', async () => {
    await gatewayFor().verifyChannelSecret(STUB_CHANNEL_ID, STUB_CHANNEL_SECRET);
    const kept = JSON.stringify([
      ...(await recorded({ endpoint: 'oauth-token' })),
      ...(await recorded({ endpoint: 'oauth-revoke' })),
    ]);
    expect(kept).not.toContain(STUB_CHANNEL_SECRET);
    expect(kept).not.toContain('stub-issued-');
  });

  it('returns line.channel_secret_invalid for a wrong pair, without a revoke', async () => {
    const before = (await recorded({ endpoint: 'oauth-revoke' })).length;
    const result = await gatewayFor().verifyChannelSecret(STUB_CHANNEL_ID, 'wrong-secret');
    expect(result).toMatchObject({ ok: false, error: { code: 'line.channel_secret_invalid' } });
    expect(await recorded({ endpoint: 'oauth-revoke' })).toHaveLength(before);
  });

  it.each([429, 500, 503])(
    'returns line.unavailable ("could not check") for %i, after one attempt',
    async (status) => {
      const channelId = String(2_000_000_000 + status);
      const before = (await recorded({ endpoint: 'oauth-token' })).length;
      await failNext({ endpoint: 'oauth-token', match: { channelId }, status, times: 3 });
      const result = await gatewayFor().verifyChannelSecret(channelId, STUB_CHANNEL_SECRET);
      expect(result).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
      const calls = (await recorded({ endpoint: 'oauth-token' })).slice(before);
      expect(calls.map((r) => r.status)).toEqual([status]);
    },
  );

  it('returns line.unavailable when LINE cannot be reached', async () => {
    const gateway = createLineMessagingGateway({
      apiBaseUrl: 'http://127.0.0.1:9/line',
      dataApiBaseUrl: 'http://127.0.0.1:9/line-data',
      sleep: () => Promise.resolve(),
    });
    expect(await gateway.verifyChannelSecret(STUB_CHANNEL_ID, STUB_CHANNEL_SECRET)).toMatchObject({
      ok: false,
      error: { code: 'line.unavailable' },
    });
  });
});

describe('LINE adapter: showLoading and getBotInfo', () => {
  it('sends chatId and loadingSeconds, and does not retry', async () => {
    const userId = newUser();
    expect((await gatewayFor().showLoading(TOKEN, userId, 20)).ok).toBe(true);
    await failNext({ endpoint: 'loading', match: { to: userId }, status: 500, times: 3 });
    const failed = await gatewayFor().showLoading(TOKEN, userId, 20);
    expect(failed).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
    const items = await recorded({ endpoint: 'loading', to: userId });
    expect(items.map((r) => r.status)).toEqual([202, 500]);
    expect(items[0]?.body).toEqual({ chatId: userId, loadingSeconds: 20 });
  });

  it('maps the bot info of the stub', async () => {
    expect(await gatewayFor().getBotInfo(TOKEN)).toEqual({
      ok: true,
      value: {
        botName: 'ต้นหอม คาเฟ่ (ทดสอบ)',
        basicId: '@000stub',
        botUserId: 'Ustub00000000000000000000000000000',
      },
    });
  });

  it('returns line.credentials_invalid for 403', async () => {
    await failNext({ endpoint: 'info', status: 403 });
    const result = await gatewayFor().getBotInfo(TOKEN);
    expect(result).toMatchObject({ ok: false, error: { code: 'line.credentials_invalid' } });
  });

  it('returns line.unavailable when LINE cannot be reached', async () => {
    const gateway = createLineMessagingGateway({
      apiBaseUrl: 'http://127.0.0.1:9/line',
      dataApiBaseUrl: 'http://127.0.0.1:9/line-data',
      sleep: () => Promise.resolve(),
    });
    expect(await gateway.getBotInfo(TOKEN)).toMatchObject({
      ok: false,
      error: { code: 'line.unavailable' },
    });
    expect(await gateway.showLoading(TOKEN, newUser(), 20)).toMatchObject({
      ok: false,
      error: { code: 'line.unavailable' },
    });
  });
});

describe('LINE adapter: rich menu', () => {
  const newMenu = async (): Promise<string> => {
    const created = await gatewayFor().createRichMenu(TOKEN, richMenuSpec());
    if (!created.ok) throw new Error('create failed');
    return created.value.richMenuId;
  };

  it('sends the menu as LINE JSON with postback areas, selected and the chat bar text', async () => {
    const before = (await recorded({ endpoint: 'richmenu-create' })).length;
    await newMenu();
    const [call] = (await recorded({ endpoint: 'richmenu-create' })).slice(before);
    expect(call?.body).toEqual(toLineRichMenu(richMenuSpec()));
    expect(call?.body).toMatchObject({
      size: { width: 2500, height: 843 },
      selected: true,
      areas: [
        { action: { type: 'postback', data: 'tw1:ai_on', displayText: 'คุยกับ AI' } },
        { action: { type: 'postback', data: 'tw1:admin', displayText: 'คุยกับแอดมิน' } },
        { action: { type: 'postback', data: 'tw1:how_to', displayText: 'วิธีทดสอบ' } },
      ],
    });
  });

  it('uploads the built-in PNG to the data host as image/png, under 1 MB', async () => {
    const id = await newMenu();
    const before = (await recorded({ endpoint: 'richmenu-upload' })).length;
    expect((await gatewayFor().uploadRichMenuImage(TOKEN, id)).ok).toBe(true);
    const [call] = (await recorded({ endpoint: 'richmenu-upload' })).slice(before);
    expect(call?.path).toBe(`/line-data/v2/bot/richmenu/${id}/content`);
    expect(call?.headers.contentType).toBe('image/png');
    const png = Buffer.from(RICH_MENU_IMAGE_PNG_BASE64, 'base64');
    expect(call?.body).toEqual({ contentType: 'image/png', bytes: png.length });
    expect(png.length).toBeLessThanOrEqual(1024 * 1024);
    // PNG IHDR: width and height at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2500, 843]);
  });

  it('creates once only: a 5xx is line.unavailable without a second attempt', async () => {
    const before = (await recorded({ endpoint: 'richmenu-create' })).length;
    await failNext({ endpoint: 'richmenu-create', status: 500, times: 3 });
    const result = await gatewayFor().createRichMenu(TOKEN, richMenuSpec());
    expect(result).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
    expect((await recorded({ endpoint: 'richmenu-create' })).slice(before)).toHaveLength(1);
    await control('/reset', {});
  });

  it.each([
    [429, 'line.rate_limited'],
    [400, 'line.rich_menu_failed'],
    [403, 'line.rich_menu_failed'],
  ])('maps %i of create to %s', async (status, code) => {
    await failNext({ endpoint: 'richmenu-create', status, body: { message: 'x' } });
    const result = await gatewayFor().createRichMenu(TOKEN, richMenuSpec());
    expect(result).toMatchObject({ ok: false, error: { code } });
  });

  it('returns line.rich_menu_failed for a 2xx without a usable id', async () => {
    await failNext({ endpoint: 'richmenu-create', status: 200, body: { richMenuId: '../x' } });
    const result = await gatewayFor().createRichMenu(TOKEN, richMenuSpec());
    expect(result).toMatchObject({ ok: false, error: { code: 'line.rich_menu_failed' } });
  });

  it('refuses an id that could change the path, without calling LINE', async () => {
    const before = (await recorded({})).length;
    for (const call of [
      gatewayFor().uploadRichMenuImage(TOKEN, '../x'),
      gatewayFor().setDefaultRichMenu(TOKEN, 'a/b'),
      gatewayFor().deleteRichMenu(TOKEN, '%2e'),
    ]) {
      expect(await call).toMatchObject({ ok: false, error: { code: 'line.rich_menu_failed' } });
    }
    expect(await recorded({})).toHaveLength(before);
  });

  it('retries setting the default after a 5xx', async () => {
    const id = await newMenu();
    await gatewayFor().uploadRichMenuImage(TOKEN, id);
    await failNext({ endpoint: 'richmenu-default', status: 503 });
    expect((await gatewayFor().setDefaultRichMenu(TOKEN, id)).ok).toBe(true);
    await gatewayFor().clearDefaultRichMenu(TOKEN);
    await gatewayFor().deleteRichMenu(TOKEN, id);
  });
});

describe('LINE adapter: welcome card', () => {
  const card = buildWelcomeCard({
    botName: 'บัญชีทดสอบ',
    welcomeText: 'ข้อความที่แก้',
    particle: 'ค่ะ',
    appBaseUrl: 'https://chat.example.com',
  });

  it('replies with a Flex bubble: gradient header, logo, text, three postback buttons', async () => {
    const replyToken = hex();
    expect((await gatewayFor().reply(TOKEN, replyToken, [{ type: 'card', card }])).ok).toBe(true);
    const calls = await recorded({ endpoint: 'reply' });
    const call = calls.find(
      (r) => (r.body as { replyToken?: string } | null)?.replyToken === replyToken,
    );
    const message = (call?.body as { messages: unknown[] }).messages[0];
    expect(message).toEqual(toFlexWelcome(card));
    expect(message).toMatchObject({
      type: 'flex',
      altText: card.altText,
      contents: {
        type: 'bubble',
        header: {
          background: { type: 'linearGradient' },
          contents: [{ type: 'image', url: 'https://chat.example.com/brand/app-icon-512.png' }, {}],
        },
        footer: {
          contents: [
            { style: 'primary', action: { type: 'postback', data: 'tw1:ai_on' } },
            { style: 'secondary', action: { type: 'postback', data: 'tw1:admin' } },
            { style: 'link', action: { type: 'postback', data: 'tw1:how_to' } },
          ],
        },
      },
    });
    expect(JSON.stringify(message)).toContain('ข้อความที่แก้');
  });

  it('draws a text tile in place of the logo when the base URL is not HTTPS', () => {
    const plain = buildWelcomeCard({
      botName: null,
      welcomeText: '',
      particle: 'ครับ',
      appBaseUrl: 'http://localhost:3000',
    });
    const flex = toFlexWelcome(plain);
    expect(flex.contents.header.contents[0]).toMatchObject({ type: 'box' });
    expect(JSON.stringify(flex)).not.toContain('http://');
  });
});
