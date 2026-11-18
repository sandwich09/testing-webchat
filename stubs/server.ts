// Stub server for LINE and Claude. Behaviour is specified in docs/qa/stubs-and-fixtures.md.
// Node built-ins only. Run with `node stubs/server.ts` (Node strips the types itself).
// This is one file on purpose: Node needs `.ts` extensions in relative imports and
// tsconfig does not allow them, so a split into stubs/lib would not typecheck.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pipeline, Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// Configuration and constants
// ---------------------------------------------------------------------------

const PORT = Number(process.env['STUB_PORT'] ?? '4010');
const PUBLIC_URL = (process.env['STUB_PUBLIC_URL'] ?? 'http://localhost:4010').replace(/\/+$/, '');
const ASSET_DIR = join(import.meta.dirname, 'assets');

const MAX_RECORDS = 2000;
const MAX_BODY_BYTES = 128 * 1024 * 1024;
const MAX_LINE_MESSAGES = 5;
const MAX_TEXT_LENGTH = 5000;
const MIB = 1024 * 1024;
const BIG_IMAGE_BYTES = 11 * MIB;
const BIG_VIDEO_BYTES = 51 * MIB;
const STREAM_CHUNK_BYTES = 64 * 1024;

const INVALID_LINE_TOKEN = 'stub-invalid-token';
const INVALID_CLAUDE_KEY = 'stub-invalid-key';
const LINE_AUTH_MESSAGE =
  'Authentication failed. Confirm that the access token in the authorization header is valid.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const MP4_HEAD = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
]);

const DEFAULT_REPLY_TEXT =
  '{"reply":"สวัสดีค่ะ นี่คือคำตอบทดสอบจาก AI","needsAdmin":false,"handoffReason":null}';
const DEFAULT_EXTRACT_TEXT = 'ต้นหอม คาเฟ่ (ไฟล์ทดสอบ)\n\nเวลาเปิดปิด\nวันอังคาร ถึง วันอาทิตย์ 08:00 - 18:00';
const DEFAULT_GUARD_TEXT = '{"allowed":true,"matchedTopic":null}';
/** stubs-and-fixtures 5.3: default usage per request kind. */
const DEFAULT_USAGE: Record<ClaudeKind, ClaudeUsage> = {
  reply: { input_tokens: 1200, output_tokens: 80 },
  extract: { input_tokens: 3000, output_tokens: 400 },
  guard: { input_tokens: 400, output_tokens: 20 },
};
const DEFAULT_TEXT: Record<ClaudeKind, string> = {
  reply: DEFAULT_REPLY_TEXT,
  extract: DEFAULT_EXTRACT_TEXT,
  guard: DEFAULT_GUARD_TEXT,
};
/** Text deltas per text block of a streamed answer, so the SDK has to join them. */
const STREAM_TEXT_PIECES = 3;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Service = 'line' | 'line-data' | 'claude';
type LineEndpoint =
  | 'reply'
  | 'push'
  | 'profile'
  | 'loading'
  | 'info'
  | 'content'
  | 'content-preview'
  | 'content-transcoding';
const LINE_ENDPOINTS: readonly string[] = [
  'reply',
  'push',
  'profile',
  'loading',
  'info',
  'content',
  'content-preview',
  'content-transcoding',
];

type RecordedRequest = {
  seq: number;
  at: string;
  service: Service;
  endpoint: string;
  /** Only for service claude (stubs-and-fixtures 5.3). */
  purpose?: ClaudePurpose;
  method: string;
  path: string;
  headers: {
    authorization: 'bearer' | 'missing' | 'other';
    contentType?: string;
    xLineRetryKey?: string;
    xApiKey?: 'present' | 'missing';
    anthropicVersion?: string;
    anthropicBeta?: string;
  };
  body: unknown;
  status: number;
};

type Payload =
  | { kind: 'json'; value: unknown }
  | { kind: 'bytes'; contentType: string; data: Buffer; contentLength: boolean }
  | { kind: 'sse'; text: string }
  | { kind: 'stream'; contentType: string; head: Buffer; totalBytes: number };

type Reply = {
  status: number;
  headers: Record<string, string>;
  payload: Payload;
  delayMs: number;
};

type Incoming = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingMessage['headers'];
  body: unknown;
  bodyIsJson: boolean;
};

type LineMatch = { to?: string; userId?: string; messageId?: string; replyToken?: string };
type LineFacts = LineMatch;

type Entry<M, D> = { match: M | undefined; times: number; data: D };
type LineFail = {
  endpoint: string;
  status: number;
  body: unknown;
  headers: Record<string, string>;
};
type LineDelay = { endpoint: string; ms: number };
type ClaudeKind = 'reply' | 'extract' | 'guard';
type ClaudePurpose = ClaudeKind | 'count_tokens';
const CLAUDE_PURPOSES: readonly string[] = ['reply', 'extract', 'guard', 'count_tokens'];
/** Recorded endpoint names of stubs-and-fixtures 5.2. */
type ClaudeEndpoint = 'messages' | 'count-tokens';
type ClaudeUsage = Record<string, number>;
type ClaudeNext = {
  kind: ClaudeKind | undefined;
  text: string | undefined;
  stopReason: string | undefined;
  model: string | undefined;
  usage: ClaudeUsage;
  withThinkingBlock: boolean;
};
type ClaudeFail = { endpoint: ClaudeEndpoint; status: number; errorType: string };
type ClaudeDelay = { endpoint: ClaudeEndpoint; ms: number };
/** Bytes seeded with POST /__control/line/content for one message id. */
type SeededContent = {
  data: Buffer;
  contentType: string;
  preview: Buffer | undefined;
  previewContentType: string;
  sendContentLength: boolean;
};
type Profile = { displayName: string; pictureUrl: string | null | undefined };

type State = {
  seq: number;
  ids: number;
  records: RecordedRequest[];
  usedReplyTokens: Set<string>;
  retryKeys: Map<string, string>;
  profiles: Map<string, Profile>;
  lineFail: Entry<LineMatch, LineFail>[];
  lineDelay: Entry<LineMatch, LineDelay>[];
  claudeNext: Entry<string, ClaudeNext>[];
  claudeFail: Entry<string, ClaudeFail>[];
  claudeDelay: Entry<string, ClaudeDelay>[];
  countTokens: { value: number; times: number }[];
  lineContent: Map<string, SeededContent>;
};

type Params = readonly string[];
type LineRoute = {
  endpoint: LineEndpoint;
  service: 'line' | 'line-data';
  method: 'GET' | 'POST';
  pattern: RegExp;
  facts: (inc: Incoming, params: Params) => LineFacts;
  validate: (inc: Incoming, params: Params) => Reply | undefined;
  handle: (inc: Incoming, params: Params) => Reply | Promise<Reply>;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function createState(seq: number, ids: number): State {
  return {
    seq,
    ids,
    records: [],
    usedReplyTokens: new Set(),
    retryKeys: new Map(),
    profiles: new Map(),
    lineFail: [],
    lineDelay: [],
    claudeNext: [],
    claudeFail: [],
    claudeDelay: [],
    countTokens: [],
    lineContent: new Map(),
  };
}

let state = createState(0, 100000);

function nextId(): number {
  state.ids += 1;
  return state.ids;
}

function record(entry: Omit<RecordedRequest, 'seq' | 'at'>): void {
  state.seq += 1;
  state.records.push({ seq: state.seq, at: new Date().toISOString(), ...entry });
  if (state.records.length > MAX_RECORDS)
    state.records.splice(0, state.records.length - MAX_RECORDS);
}

/** Selection order: an entry with a matching `match` first (FIFO), else an entry without `match`. */
function takeEntry<M, D>(
  queue: Entry<M, D>[],
  accepts: (data: D) => boolean,
  matches: (match: M) => boolean,
): Entry<M, D> | undefined {
  let index = queue.findIndex((e) => accepts(e.data) && e.match !== undefined && matches(e.match));
  if (index < 0) index = queue.findIndex((e) => accepts(e.data) && e.match === undefined);
  const entry = queue[index];
  if (entry === undefined) return undefined;
  entry.times -= 1;
  if (entry.times <= 0) queue.splice(index, 1);
  return entry;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function headerValue(inc: Incoming, name: string): string | undefined {
  const value = inc.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function json(status: number, value: unknown, headers: Record<string, string> = {}): Reply {
  return { status, headers, payload: { kind: 'json', value }, delayMs: 0 };
}

function lineBadRequest(detail: string): Reply {
  return json(400, {
    message: 'The request body has 1 error(s)',
    details: [{ message: detail }],
  });
}

function claudeError(status: number, type: string, message: string): Reply {
  return json(status, { type: 'error', error: { type, message } });
}

function authorizationKind(inc: Incoming): 'bearer' | 'missing' | 'other' {
  const value = headerValue(inc, 'authorization');
  if (value === undefined) return 'missing';
  return /^Bearer\s+\S+/i.test(value) ? 'bearer' : 'other';
}

function bearerToken(inc: Incoming): string {
  return (headerValue(inc, 'authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
}

function isJsonContentType(inc: Incoming): boolean {
  return /^application\/json\b/i.test(headerValue(inc, 'content-type') ?? '');
}

function factsMatch(match: LineMatch, facts: LineFacts): boolean {
  const keys = ['to', 'userId', 'messageId', 'replyToken'] as const;
  return keys.every((key) => match[key] === undefined || match[key] === facts[key]);
}

// ---------------------------------------------------------------------------
// LINE
// ---------------------------------------------------------------------------

function isValidLineMessage(message: unknown): string | undefined {
  if (!isRecord(message)) return 'message must be an object';
  const type = message['type'];
  if (type === 'text') {
    const text = message['text'];
    if (typeof text !== 'string' || text.length < 1 || text.length > MAX_TEXT_LENGTH) {
      return `text must be 1 to ${String(MAX_TEXT_LENGTH)} characters`;
    }
    return undefined;
  }
  if (type === 'image' || type === 'video') {
    for (const field of ['originalContentUrl', 'previewImageUrl']) {
      if (!isHttpUrl(message[field])) return `${field} must be an http or https URL`;
    }
    return undefined;
  }
  return 'unsupported message type';
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function validateMessages(body: Record<string, unknown>): Reply | undefined {
  const messages = body['messages'];
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_LINE_MESSAGES) {
    return lineBadRequest(`messages must have 1 to ${String(MAX_LINE_MESSAGES)} items`);
  }
  for (const message of messages) {
    const problem = isValidLineMessage(message);
    if (problem !== undefined) return lineBadRequest(problem);
  }
  return undefined;
}

function sentMessages(body: Record<string, unknown>): Reply {
  const count = Array.isArray(body['messages']) ? body['messages'].length : 1;
  const sent = Array.from({ length: count }, () => {
    const id = nextId();
    return { id: String(id), quoteToken: `stub-qt-${String(id)}` };
  });
  return json(200, { sentMessages: sent });
}

function bodyRecord(inc: Incoming): Record<string, unknown> {
  return isRecord(inc.body) ? inc.body : {};
}

function stringField(inc: Incoming, field: string): string | undefined {
  const value = bodyRecord(inc)[field];
  return typeof value === 'string' ? value : undefined;
}

function param(params: Params, index: number): string {
  return decodeParam(params[index] ?? '');
}

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readAsset(name: string): Promise<Buffer | undefined> {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) return undefined;
  try {
    return await readFile(join(ASSET_DIR, name));
  } catch {
    return undefined;
  }
}

const MISSING_ASSET = (): Reply => json(404, { message: 'stub: asset missing' });

function bytesReply(contentType: string, data: Buffer, contentLength = true): Reply {
  return {
    status: 200,
    headers: {},
    payload: { kind: 'bytes', contentType, data, contentLength },
    delayMs: 0,
  };
}

async function fileReply(name: string, contentType: string): Promise<Reply> {
  const data = await readAsset(name);
  if (data === undefined) return MISSING_ASSET();
  return bytesReply(contentType, data);
}

function streamReply(contentType: string, head: Buffer, totalBytes: number): Reply {
  // No Content-Length on purpose: the app must enforce its size limit while reading.
  return {
    status: 200,
    headers: {},
    payload: { kind: 'stream', contentType, head, totalBytes },
    delayMs: 0,
  };
}

async function contentReply(messageId: string): Promise<Reply> {
  const seeded = state.lineContent.get(messageId);
  if (seeded !== undefined) {
    return bytesReply(seeded.contentType, seeded.data, seeded.sendContentLength);
  }
  if (messageId.startsWith('bigimg')) return streamReply('image/jpeg', JPEG_HEAD, BIG_IMAGE_BYTES);
  if (messageId.startsWith('bigvid')) return streamReply('video/mp4', MP4_HEAD, BIG_VIDEO_BYTES);
  if (messageId.startsWith('fakeimg')) return bytesReply('image/jpeg', Buffer.from('not an image'));
  if (messageId.startsWith('img')) return fileReply('tiny.jpg', 'image/jpeg');
  if (messageId.startsWith('vid')) return fileReply('tiny.mp4', 'video/mp4');
  return json(404, { message: 'Not found' });
}

/** A seeded message id answers with its seeded preview, or 404 when none was seeded. */
async function previewReply(messageId: string): Promise<Reply> {
  const seeded = state.lineContent.get(messageId);
  if (seeded === undefined) return fileReply('tiny.jpg', 'image/jpeg');
  if (seeded.preview === undefined) return json(404, { message: 'Not found' });
  return bytesReply(seeded.previewContentType, seeded.preview, seeded.sendContentLength);
}

function profileReply(userId: string): Reply {
  const registered = state.profiles.get(userId);
  if (
    userId.startsWith('noprofile-') ||
    (registered === undefined && userId.startsWith('Unoprofile'))
  ) {
    return json(404, { message: 'Not found' });
  }
  if (registered !== undefined) {
    const body: Record<string, unknown> = {
      userId,
      displayName: registered.displayName,
      language: 'th',
    };
    // No picture unless the test registers one: a URL on the stub's own origin is blocked by the
    // app's CSP (img-src), so a default picture would only produce console errors in the browser.
    if (typeof registered.pictureUrl === 'string') body['pictureUrl'] = registered.pictureUrl;
    return json(200, body);
  }
  return json(200, {
    userId,
    displayName: `ลูกค้าทดสอบ ${userId.slice(-4)}`,
    language: 'th',
  });
}

function handleReply(inc: Incoming): Reply {
  const token = stringField(inc, 'replyToken') ?? '';
  if (token.startsWith('expired-') || state.usedReplyTokens.has(token)) {
    return json(400, { message: 'Invalid reply token' });
  }
  state.usedReplyTokens.add(token);
  return sentMessages(bodyRecord(inc));
}

function handlePush(inc: Incoming): Reply {
  const key = headerValue(inc, 'x-line-retry-key') ?? '';
  const accepted = state.retryKeys.get(key);
  if (accepted !== undefined) {
    return json(
      409,
      { message: 'The retry key is already accepted' },
      { 'x-line-accepted-request-id': accepted },
    );
  }
  const requestId = `stub-req-${String(nextId())}`;
  state.retryKeys.set(key, requestId);
  const reply = sentMessages(bodyRecord(inc));
  reply.headers['x-line-request-id'] = requestId;
  return reply;
}

function validateLoading(inc: Incoming): Reply | undefined {
  const seconds = bodyRecord(inc)['loadingSeconds'];
  if (
    !isNonEmptyString(stringField(inc, 'chatId')) ||
    !stringField(inc, 'chatId')?.startsWith('U')
  ) {
    return lineBadRequest('chatId must start with U');
  }
  if (
    typeof seconds !== 'number' ||
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > 60 ||
    seconds % 5 !== 0
  ) {
    return lineBadRequest('loadingSeconds must be a multiple of 5 from 5 to 60');
  }
  return undefined;
}

const LINE_ROUTES: readonly LineRoute[] = [
  {
    endpoint: 'reply',
    service: 'line',
    method: 'POST',
    pattern: /^\/line\/v2\/bot\/message\/reply$/,
    facts: (inc) => ({ replyToken: stringField(inc, 'replyToken') }),
    validate: (inc) => {
      if (!isNonEmptyString(stringField(inc, 'replyToken'))) {
        return lineBadRequest('replyToken must be a non-empty string');
      }
      return validateMessages(bodyRecord(inc));
    },
    handle: handleReply,
  },
  {
    endpoint: 'push',
    service: 'line',
    method: 'POST',
    pattern: /^\/line\/v2\/bot\/message\/push$/,
    facts: (inc) => ({ to: stringField(inc, 'to') }),
    validate: (inc) => {
      if (!stringField(inc, 'to')?.startsWith('U')) return lineBadRequest('to must start with U');
      if (!UUID_PATTERN.test(headerValue(inc, 'x-line-retry-key') ?? '')) {
        return lineBadRequest('X-Line-Retry-Key must be a UUID');
      }
      return validateMessages(bodyRecord(inc));
    },
    handle: handlePush,
  },
  {
    endpoint: 'profile',
    service: 'line',
    method: 'GET',
    pattern: /^\/line\/v2\/bot\/profile\/([^/]+)$/,
    facts: (_inc, params) => ({ userId: param(params, 0) }),
    validate: () => undefined,
    handle: (_inc, params) => profileReply(param(params, 0)),
  },
  {
    endpoint: 'loading',
    service: 'line',
    method: 'POST',
    pattern: /^\/line\/v2\/bot\/chat\/loading\/start$/,
    facts: (inc) => ({ to: stringField(inc, 'chatId') }),
    validate: validateLoading,
    handle: () => json(202, {}),
  },
  {
    endpoint: 'info',
    service: 'line',
    method: 'GET',
    pattern: /^\/line\/v2\/bot\/info$/,
    facts: () => ({}),
    validate: () => undefined,
    handle: () =>
      json(200, {
        userId: 'Ustub00000000000000000000000000000',
        basicId: '@000stub',
        displayName: 'ต้นหอม คาเฟ่ (ทดสอบ)',
        pictureUrl: `${PUBLIC_URL}/assets/oa.png`,
        chatMode: 'bot',
        markAsReadMode: 'auto',
      }),
  },
  {
    endpoint: 'content',
    service: 'line-data',
    method: 'GET',
    pattern: /^\/line-data\/v2\/bot\/message\/([^/]+)\/content$/,
    facts: (_inc, params) => ({ messageId: param(params, 0) }),
    validate: () => undefined,
    handle: (_inc, params) => contentReply(param(params, 0)),
  },
  {
    endpoint: 'content-preview',
    service: 'line-data',
    method: 'GET',
    pattern: /^\/line-data\/v2\/bot\/message\/([^/]+)\/content\/preview$/,
    facts: (_inc, params) => ({ messageId: param(params, 0) }),
    validate: () => undefined,
    handle: (_inc, params) => previewReply(param(params, 0)),
  },
  {
    endpoint: 'content-transcoding',
    service: 'line-data',
    method: 'GET',
    pattern: /^\/line-data\/v2\/bot\/message\/([^/]+)\/content\/transcoding$/,
    facts: (_inc, params) => ({ messageId: param(params, 0) }),
    validate: () => undefined,
    handle: () => json(200, { status: 'succeeded' }),
  },
];

function checkLineCommon(route: LineRoute, inc: Incoming): Reply | undefined {
  const token = bearerToken(inc);
  if (authorizationKind(inc) !== 'bearer' || token === INVALID_LINE_TOKEN) {
    return json(401, { message: LINE_AUTH_MESSAGE });
  }
  if (
    route.method === 'POST' &&
    (!isJsonContentType(inc) || !inc.bodyIsJson || !isRecord(inc.body))
  ) {
    return json(400, { message: 'The request body has 1 error(s)' });
  }
  return undefined;
}

async function runLine(route: LineRoute, inc: Incoming, params: Params): Promise<Reply> {
  const rejected = checkLineCommon(route, inc) ?? route.validate(inc, params);
  if (rejected !== undefined) return rejected;
  const facts = route.facts(inc, params);
  const sameEndpoint = (data: { endpoint: string }): boolean => data.endpoint === route.endpoint;
  const fail = takeEntry(state.lineFail, sameEndpoint, (m) => factsMatch(m, facts));
  const delay = takeEntry(state.lineDelay, sameEndpoint, (m) => factsMatch(m, facts));
  const reply =
    fail === undefined
      ? await route.handle(inc, params)
      : json(fail.data.status, fail.data.body, fail.data.headers);
  return delay === undefined ? reply : { ...reply, delayMs: delay.data.ms };
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

function contentBlocks(content: unknown): unknown[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function textsOf(content: unknown): string[] {
  const texts: string[] = [];
  for (const block of contentBlocks(content)) {
    if (isRecord(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
      texts.push(block['text']);
    }
  }
  return texts;
}

function documentTextsOf(content: unknown): string[] {
  const texts: string[] = [];
  for (const block of contentBlocks(content)) {
    if (!isRecord(block) || block['type'] !== 'document') continue;
    for (const field of ['title', 'context']) {
      const value = block[field];
      if (typeof value === 'string') texts.push(value);
    }
    const source = block['source'];
    if (isRecord(source) && source['type'] === 'text' && typeof source['data'] === 'string') {
      texts.push(source['data']);
    }
  }
  return texts;
}

function messagesOf(body: unknown): Record<string, unknown>[] {
  const messages = isRecord(body) ? body['messages'] : undefined;
  return Array.isArray(messages) ? messages.filter(isRecord) : [];
}

/** stubs-and-fixtures 5.3, in order: the guard schema, then a document block, then a reply. */
function claudeKindOf(body: unknown): ClaudeKind {
  const outputConfig = isRecord(body) ? body['output_config'] : undefined;
  const format = isRecord(outputConfig) ? outputConfig['format'] : undefined;
  const schema = isRecord(format) ? format['schema'] : undefined;
  const properties = isRecord(schema) ? schema['properties'] : undefined;
  if (isRecord(properties) && Object.hasOwn(properties, 'allowed')) return 'guard';
  const hasDocument = messagesOf(body).some((m) =>
    contentBlocks(m['content']).some((b) => isRecord(b) && b['type'] === 'document'),
  );
  return hasDocument ? 'extract' : 'reply';
}

function claudePurposeOf(endpoint: ClaudeEndpoint, body: unknown): ClaudePurpose {
  return endpoint === 'count-tokens' ? 'count_tokens' : claudeKindOf(body);
}

function claudeMatches(needle: string, body: unknown): boolean {
  const messages = messagesOf(body);
  const lastUser = messages.filter((m) => m['role'] === 'user').at(-1);
  const haystack = [
    ...(lastUser === undefined ? [] : textsOf(lastUser['content'])),
    ...messages.flatMap((m) => documentTextsOf(m['content'])),
  ];
  return haystack.some((text) => text.includes(needle));
}

/**
 * The API key of SDK 1.10.0 arrives as `Authorization: Bearer <key>`; other clients (curl, older
 * SDKs) send `x-api-key`. Either is accepted. The recorded headers say which one was used.
 */
function claudeApiKey(inc: Incoming): string | undefined {
  const xApiKey = headerValue(inc, 'x-api-key');
  if (isNonEmptyString(xApiKey)) return xApiKey;
  return authorizationKind(inc) === 'bearer' ? bearerToken(inc) : undefined;
}

function validateClaude(inc: Incoming, endpoint: ClaudeEndpoint): Reply | undefined {
  const key = claudeApiKey(inc);
  if (key === undefined || key === INVALID_CLAUDE_KEY) {
    return claudeError(401, 'authentication_error', 'stub: missing or invalid API key');
  }
  if (headerValue(inc, 'anthropic-version') === undefined) {
    return claudeError(400, 'invalid_request_error', 'stub: missing anthropic-version');
  }
  const body = inc.body;
  if (!inc.bodyIsJson || !isRecord(body)) {
    return claudeError(400, 'invalid_request_error', 'stub: body must be a JSON object');
  }
  if (typeof body['model'] !== 'string') {
    return claudeError(400, 'invalid_request_error', 'stub: model must be a string');
  }
  // count_tokens takes no max_tokens in the real API, so it is only required for messages.
  if (endpoint === 'messages' && !isPositiveInt(body['max_tokens'])) {
    return claudeError(400, 'invalid_request_error', 'stub: max_tokens must be a positive integer');
  }
  const messages = body['messages'];
  if (!Array.isArray(messages) || messages.length === 0) {
    return claudeError(400, 'invalid_request_error', 'stub: messages must be a non-empty array');
  }
  if (!isRecord(messages[0]) || messages[0]['role'] !== 'user') {
    return claudeError(400, 'invalid_request_error', 'stub: first message must have role user');
  }
  for (const field of ['temperature', 'top_p', 'top_k']) {
    if (field in body) {
      return claudeError(400, 'invalid_request_error', `stub: ${field} is not supported`);
    }
  }
  return undefined;
}

/** Guard requests take only `guard` entries; other requests take entries of their kind or none. */
function acceptsKind(kind: ClaudeKind): (data: ClaudeNext) => boolean {
  if (kind === 'guard') return (d) => d.kind === 'guard';
  return (d) => d.kind === undefined || d.kind === kind;
}

function claudeMessageBody(body: Record<string, unknown>): Record<string, unknown> {
  const kind = claudeKindOf(body);
  const next = takeEntry(state.claudeNext, acceptsKind(kind), (m) => claudeMatches(m, body))?.data;
  const content: unknown[] = [];
  if (next?.withThinkingBlock === true) {
    content.push({ type: 'thinking', thinking: '', signature: 'stub' });
  }
  content.push({ type: 'text', text: next?.text ?? DEFAULT_TEXT[kind] });
  return {
    id: `msg_stub_${String(nextId()).padStart(6, '0')}`,
    type: 'message',
    role: 'assistant',
    model: next?.model ?? (typeof body['model'] === 'string' ? body['model'] : 'stub-model'),
    content,
    stop_reason: next?.stopReason ?? 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      ...DEFAULT_USAGE[kind],
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...next?.usage,
    },
  };
}

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/** Splits text by code point into at most `count` non-empty pieces. */
function piecesOf(text: string, count: number): string[] {
  const chars = Array.from(text);
  const size = Math.max(1, Math.ceil(chars.length / count));
  const pieces: string[] = [];
  for (let i = 0; i < chars.length; i += size) pieces.push(chars.slice(i, i + size).join(''));
  return pieces;
}

/** Events of one content block, shaped as the SDK's MessageStream accumulates them. */
function blockEvents(block: unknown, index: number): string[] {
  const events: string[] = [];
  if (isRecord(block) && block['type'] === 'text') {
    const text = typeof block['text'] === 'string' ? block['text'] : '';
    events.push(
      sseEvent('content_block_start', {
        index,
        content_block: { type: 'text', text: '', citations: null },
      }),
    );
    for (const piece of piecesOf(text, STREAM_TEXT_PIECES)) {
      events.push(
        sseEvent('content_block_delta', { index, delta: { type: 'text_delta', text: piece } }),
      );
    }
  } else if (isRecord(block) && block['type'] === 'thinking') {
    events.push(
      sseEvent('content_block_start', {
        index,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }),
    );
    const thinking = typeof block['thinking'] === 'string' ? block['thinking'] : '';
    if (thinking !== '') {
      events.push(
        sseEvent('content_block_delta', { index, delta: { type: 'thinking_delta', thinking } }),
      );
    }
    events.push(
      sseEvent('content_block_delta', {
        index,
        delta: { type: 'signature_delta', signature: block['signature'] },
      }),
    );
  } else {
    events.push(sseEvent('content_block_start', { index, content_block: block }));
  }
  events.push(sseEvent('content_block_stop', { index }));
  return events;
}

/**
 * The streaming Messages API sequence for one message: message_start (empty content, no stop
 * reason), the events of each block, message_delta with the stop reason and the final usage, then
 * message_stop. Event names and payload shapes follow RawMessageStreamEvent of the SDK.
 */
function eventStreamOf(message: Record<string, unknown>): string {
  const usage = isRecord(message['usage']) ? message['usage'] : {};
  const content = Array.isArray(message['content']) ? message['content'] : [];
  const events = [
    sseEvent('message_start', {
      message: {
        ...message,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        usage: { ...usage, output_tokens: 0 },
      },
    }),
    ...content.flatMap((block, index) => blockEvents(block, index)),
    sseEvent('message_delta', {
      delta: {
        stop_reason: message['stop_reason'],
        stop_sequence: null,
        stop_details: null,
        container: null,
      },
      usage,
    }),
    sseEvent('message_stop', {}),
  ];
  return events.join('');
}

function claudeMessage(inc: Incoming): Reply {
  const body = bodyRecord(inc);
  const message = claudeMessageBody(body);
  if (body['stream'] !== true) return json(200, message);
  return {
    status: 200,
    headers: {},
    payload: { kind: 'sse', text: eventStreamOf(message) },
    delayMs: 0,
  };
}

function countCharacters(body: Record<string, unknown>): number {
  const system = body['system'];
  const texts = [...textsOf(system)];
  for (const message of messagesOf(body)) {
    texts.push(...textsOf(message['content']));
    const content = message['content'];
    for (const block of contentBlocks(content)) {
      if (isRecord(block) && block['type'] === 'document') {
        const source = block['source'];
        if (isRecord(source) && source['type'] === 'text' && typeof source['data'] === 'string') {
          texts.push(source['data']);
        }
      }
    }
  }
  return texts.reduce((sum, text) => sum + text.length, 0);
}

function claudeCountTokens(inc: Incoming): Reply {
  const forced = state.countTokens[0];
  if (forced !== undefined) {
    forced.times -= 1;
    if (forced.times <= 0) state.countTokens.shift();
    return json(200, { input_tokens: forced.value });
  }
  return json(200, { input_tokens: Math.ceil(countCharacters(bodyRecord(inc)) / 4) });
}

function runClaude(endpoint: ClaudeEndpoint, inc: Incoming): Reply {
  const rejected = validateClaude(inc, endpoint);
  if (rejected !== undefined) return rejected;
  const body = bodyRecord(inc);
  const sameEndpoint = (data: { endpoint: ClaudeEndpoint }): boolean => data.endpoint === endpoint;
  const matches = (m: string): boolean => claudeMatches(m, body);
  const fail = takeEntry(state.claudeFail, sameEndpoint, matches);
  const delay = takeEntry(state.claudeDelay, sameEndpoint, matches);
  let reply: Reply;
  if (fail !== undefined) {
    reply = claudeError(
      fail.data.status,
      fail.data.errorType,
      `stub: forced ${fail.data.errorType}`,
    );
  } else {
    reply = endpoint === 'messages' ? claudeMessage(inc) : claudeCountTokens(inc);
  }
  return delay === undefined ? reply : { ...reply, delayMs: delay.data.ms };
}

// ---------------------------------------------------------------------------
// Control routes
// ---------------------------------------------------------------------------

const OK = (): Reply => json(200, { ok: true });
const controlError = (message: string): Reply => json(400, { message: `stub control: ${message}` });

function optionalTimes(body: Record<string, unknown>): number | undefined {
  const times = body['times'];
  if (times === undefined) return 1;
  return isPositiveInt(times) ? times : undefined;
}

function parseLineMatch(value: unknown): LineMatch | undefined | 'invalid' {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return 'invalid';
  const match: LineMatch = {};
  for (const key of ['to', 'userId', 'messageId', 'replyToken'] as const) {
    const field = value[key];
    if (field === undefined) continue;
    if (typeof field !== 'string') return 'invalid';
    match[key] = field;
  }
  return match;
}

function parseStringMap(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return undefined;
    result[key.toLowerCase()] = entry;
  }
  return result;
}

function controlProfiles(body: Record<string, unknown>): Reply {
  const { userId, displayName, pictureUrl } = body;
  if (!isNonEmptyString(userId) || typeof displayName !== 'string') {
    return controlError('userId and displayName must be strings');
  }
  if (pictureUrl !== undefined && pictureUrl !== null && typeof pictureUrl !== 'string') {
    return controlError('pictureUrl must be a string or null');
  }
  state.profiles.set(userId, { displayName, pictureUrl });
  return OK();
}

function controlLineFail(body: Record<string, unknown>): Reply {
  const match = parseLineMatch(body['match']);
  const times = optionalTimes(body);
  const headers = parseStringMap(body['headers']);
  const status = body['status'];
  const endpoint = body['endpoint'];
  if (typeof endpoint !== 'string' || !LINE_ENDPOINTS.includes(endpoint)) {
    return controlError('endpoint must be a LINE endpoint name');
  }
  if (match === 'invalid' || times === undefined || headers === undefined) {
    return controlError('invalid match, times or headers');
  }
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) {
    return controlError('status must be an HTTP status code');
  }
  const data: LineFail = { endpoint, status, body: body['body'] ?? {}, headers };
  state.lineFail.push({ match, times, data });
  return OK();
}

function controlLineDelay(body: Record<string, unknown>): Reply {
  const match = parseLineMatch(body['match']);
  const times = optionalTimes(body);
  const endpoint = body['endpoint'];
  const ms = body['ms'];
  if (typeof endpoint !== 'string' || !LINE_ENDPOINTS.includes(endpoint)) {
    return controlError('endpoint must be a LINE endpoint name');
  }
  if (match === 'invalid' || times === undefined) return controlError('invalid match or times');
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return controlError('ms must be a non-negative number');
  }
  state.lineDelay.push({ match, times, data: { endpoint, ms } });
  return OK();
}

function parseUsage(value: unknown): ClaudeUsage | undefined {
  if (value === undefined) return {};
  if (!isRecord(value)) return undefined;
  const usage: ClaudeUsage = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'number') return undefined;
    usage[key] = entry;
  }
  return usage;
}

function optionalString(value: unknown): string | undefined | null {
  // null means the value is present but not a string
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

function controlClaudeNextReply(body: Record<string, unknown>): Reply {
  const match = optionalString(body['match']);
  const times = optionalTimes(body);
  const usage = parseUsage(body['usage']);
  const stopReason = optionalString(body['stopReason']);
  const model = optionalString(body['model']);
  const text = optionalString(body['text']);
  const given = body['kind'];
  if (given !== undefined && given !== 'reply' && given !== 'extract' && given !== 'guard') {
    return controlError('kind must be "reply", "extract" or "guard"');
  }
  const jsonValue = body['json'];
  // stubs-and-fixtures 6: without a kind, JSON with an `allowed` property is a guard answer.
  const kind: ClaudeKind | undefined =
    given ?? (isRecord(jsonValue) && Object.hasOwn(jsonValue, 'allowed') ? 'guard' : undefined);
  if (
    match === null ||
    stopReason === null ||
    model === null ||
    text === null ||
    times === undefined ||
    usage === undefined
  ) {
    return controlError('invalid match, times, usage, stopReason, model or text');
  }
  const data: ClaudeNext = {
    kind,
    text: jsonValue === undefined ? text : JSON.stringify(jsonValue),
    stopReason,
    model,
    usage,
    withThinkingBlock: body['withThinkingBlock'] === true,
  };
  state.claudeNext.push({ match, times, data });
  return OK();
}

/**
 * `endpoint` of the Claude control routes: `messages` (default) or `count_tokens`. The recorded
 * name `count-tokens` (stubs-and-fixtures 5.2) is accepted too.
 */
function parseClaudeEndpoint(value: unknown): ClaudeEndpoint | undefined {
  if (value === undefined || value === 'messages') return 'messages';
  if (value === 'count_tokens' || value === 'count-tokens') return 'count-tokens';
  return undefined;
}

function controlClaudeFail(body: Record<string, unknown>): Reply {
  const match = optionalString(body['match']);
  const times = optionalTimes(body);
  const endpoint = parseClaudeEndpoint(body['endpoint']);
  const { status, errorType } = body;
  if (match === null || times === undefined) return controlError('invalid match or times');
  if (endpoint === undefined) return controlError('endpoint must be "messages" or "count_tokens"');
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) {
    return controlError('status must be an HTTP status code');
  }
  if (!isNonEmptyString(errorType)) return controlError('errorType must be a non-empty string');
  state.claudeFail.push({ match, times, data: { endpoint, status, errorType } });
  return OK();
}

function controlClaudeDelay(body: Record<string, unknown>): Reply {
  const match = optionalString(body['match']);
  const times = optionalTimes(body);
  const endpoint = parseClaudeEndpoint(body['endpoint']);
  const ms = body['ms'];
  if (match === null || times === undefined) return controlError('invalid match or times');
  if (endpoint === undefined) return controlError('endpoint must be "messages" or "count_tokens"');
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return controlError('ms must be a non-negative number');
  }
  state.claudeDelay.push({ match, times, data: { endpoint, ms } });
  return OK();
}

function decodeBase64(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    return undefined;
  }
  return Buffer.from(value, 'base64');
}

/** Seeds the bytes that content and content/preview return for one message id. */
function controlLineContent(body: Record<string, unknown>): Reply {
  const { messageId, contentType, previewContentType, sendContentLength } = body;
  const data = decodeBase64(body['data']);
  const preview = body['preview'] === undefined ? undefined : decodeBase64(body['preview']);
  if (!isNonEmptyString(messageId) || !isNonEmptyString(contentType)) {
    return controlError('messageId and contentType must be non-empty strings');
  }
  if (data === undefined || (body['preview'] !== undefined && preview === undefined)) {
    return controlError('data and preview must be base64 strings');
  }
  if (previewContentType !== undefined && !isNonEmptyString(previewContentType)) {
    return controlError('previewContentType must be a non-empty string');
  }
  if (sendContentLength !== undefined && typeof sendContentLength !== 'boolean') {
    return controlError('sendContentLength must be a boolean');
  }
  state.lineContent.set(messageId, {
    data,
    contentType,
    preview,
    previewContentType: previewContentType ?? 'image/jpeg',
    sendContentLength: sendContentLength ?? true,
  });
  return OK();
}

function controlCountTokens(body: Record<string, unknown>): Reply {
  const times = optionalTimes(body);
  const value = body['value'];
  if (times === undefined) return controlError('invalid times');
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return controlError('value must be a non-negative integer');
  }
  state.countTokens.push({ value, times });
  return OK();
}

function queryNumber(inc: Incoming, name: string): number | undefined {
  const raw = inc.query.get(name);
  if (raw === null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function subjectOf(item: RecordedRequest): string[] {
  const subjects: string[] = [];
  if (isRecord(item.body)) {
    for (const field of ['to', 'chatId']) {
      const value = item.body[field];
      if (typeof value === 'string') subjects.push(value);
    }
  }
  const profile = /\/profile\/([^/]+)$/.exec(item.path);
  if (profile?.[1] !== undefined) subjects.push(decodeParam(profile[1]));
  return subjects;
}

function controlLineRequests(inc: Incoming): Reply {
  const endpoint = inc.query.get('endpoint');
  const to = inc.query.get('to');
  const since = queryNumber(inc, 'since') ?? 0;
  const items = state.records.filter(
    (r) =>
      r.service !== 'claude' &&
      r.seq > since &&
      (endpoint === null || r.endpoint === endpoint) &&
      (to === null || subjectOf(r).includes(to)),
  );
  return json(200, { items });
}

function controlClaudeRequests(inc: Incoming): Reply {
  const match = inc.query.get('match');
  const purpose = inc.query.get('purpose');
  const since = queryNumber(inc, 'since') ?? 0;
  if (purpose !== null && !CLAUDE_PURPOSES.includes(purpose)) {
    return controlError('purpose must be guard, reply, extract or count_tokens');
  }
  const items = state.records.filter(
    (r) =>
      r.service === 'claude' &&
      r.seq > since &&
      (purpose === null || r.purpose === purpose) &&
      (match === null || claudeMatches(match, r.body)),
  );
  return json(200, { items });
}

const CONTROL_POST: Record<string, (body: Record<string, unknown>) => Reply> = {
  '/__control/line/profiles': controlProfiles,
  '/__control/line/fail-next': controlLineFail,
  '/__control/line/delay-next': controlLineDelay,
  '/__control/line/content': controlLineContent,
  '/__control/claude/next-reply': controlClaudeNextReply,
  '/__control/claude/fail-next': controlClaudeFail,
  '/__control/claude/delay-next': controlClaudeDelay,
  '/__control/claude/count-tokens': controlCountTokens,
};

function runControl(inc: Incoming): Reply {
  if (inc.method === 'GET') {
    if (inc.path === '/__control/health') return OK();
    if (inc.path === '/__control/line/requests') return controlLineRequests(inc);
    if (inc.path === '/__control/claude/requests') return controlClaudeRequests(inc);
  }
  if (inc.method === 'POST') {
    if (inc.path === '/__control/reset') {
      state = createState(state.seq, state.ids);
      return OK();
    }
    const handler = Object.hasOwn(CONTROL_POST, inc.path) ? CONTROL_POST[inc.path] : undefined;
    if (handler !== undefined) {
      if (!inc.bodyIsJson || !isRecord(inc.body)) return controlError('body must be a JSON object');
      return handler(inc.body);
    }
  }
  return json(404, { message: 'stub: no route' });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

type Routed = {
  service: Service;
  endpoint: string;
  purpose?: ClaudePurpose;
  reply: Reply | Promise<Reply>;
};

function serviceOfPath(path: string): Service {
  if (path.startsWith('/line-data/')) return 'line-data';
  if (path.startsWith('/anthropic/')) return 'claude';
  return 'line';
}

const CLAUDE_PATHS: Partial<Record<string, ClaudeEndpoint>> = {
  '/anthropic/v1/messages': 'messages',
  '/anthropic/v1/messages/count_tokens': 'count-tokens',
};

function route(inc: Incoming): Routed {
  for (const candidate of LINE_ROUTES) {
    if (candidate.method !== inc.method) continue;
    const found = candidate.pattern.exec(inc.path);
    if (found === null) continue;
    return {
      service: candidate.service,
      endpoint: candidate.endpoint,
      reply: runLine(candidate, inc, found.slice(1)),
    };
  }
  const claudeEndpoint = Object.hasOwn(CLAUDE_PATHS, inc.path) ? CLAUDE_PATHS[inc.path] : undefined;
  if (inc.method === 'POST' && claudeEndpoint !== undefined) {
    return {
      service: 'claude',
      endpoint: claudeEndpoint,
      purpose: claudePurposeOf(claudeEndpoint, inc.body),
      reply: runClaude(claudeEndpoint, inc),
    };
  }
  return {
    service: serviceOfPath(inc.path),
    endpoint: 'unknown',
    reply: json(404, { message: 'stub: no route' }),
  };
}

function recordedHeaders(inc: Incoming, service: Service): RecordedRequest['headers'] {
  const headers: RecordedRequest['headers'] = {
    authorization: authorizationKind(inc),
  };
  if (service === 'claude') {
    headers.xApiKey = headerValue(inc, 'x-api-key') === undefined ? 'missing' : 'present';
  }
  const contentType = headerValue(inc, 'content-type');
  const retryKey = headerValue(inc, 'x-line-retry-key');
  const version = headerValue(inc, 'anthropic-version');
  const beta = headerValue(inc, 'anthropic-beta');
  if (contentType !== undefined) headers.contentType = contentType;
  if (retryKey !== undefined) headers.xLineRetryKey = retryKey;
  if (version !== undefined) headers.anthropicVersion = version;
  if (beta !== undefined) headers.anthropicBeta = beta;
  return headers;
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseJson(raw: Buffer): { ok: boolean; value: unknown } {
  if (raw.length === 0) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw.toString('utf8')) as unknown };
  } catch {
    return { ok: false, value: null };
  }
}

function* chunksOf(head: Buffer, totalBytes: number): Generator<Buffer> {
  yield head;
  const zeros = Buffer.alloc(STREAM_CHUNK_BYTES);
  let remaining = totalBytes - head.length;
  while (remaining > 0) {
    const size = Math.min(remaining, STREAM_CHUNK_BYTES);
    yield size === STREAM_CHUNK_BYTES ? zeros : zeros.subarray(0, size);
    remaining -= size;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(res: ServerResponse, reply: Reply): void {
  const { payload } = reply;
  if (payload.kind === 'json') {
    const text = JSON.stringify(payload.value);
    res.writeHead(reply.status, {
      ...reply.headers,
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(text),
    });
    res.end(text);
  } else if (payload.kind === 'bytes') {
    res.writeHead(reply.status, {
      ...reply.headers,
      'content-type': payload.contentType,
      // Without Content-Length Node sends the body chunked, as the big* prefixes do.
      ...(payload.contentLength ? { 'content-length': payload.data.length } : {}),
    });
    res.end(payload.data);
  } else if (payload.kind === 'sse') {
    res.writeHead(reply.status, {
      ...reply.headers,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    });
    res.end(payload.text);
  } else {
    res.writeHead(reply.status, { ...reply.headers, 'content-type': payload.contentType });
    pipeline(Readable.from(chunksOf(payload.head, payload.totalBytes)), res, () => undefined);
  }
}

const ASSET_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp4: 'video/mp4',
};

async function assetReply(name: string): Promise<Reply> {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  return fileReply(name, ASSET_TYPES[extension] ?? 'application/octet-stream');
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://stub.local');
  const raw = await readBody(req);
  if (raw === undefined) {
    send(res, json(413, { message: 'stub: body too large' }));
    return;
  }
  const parsed = parseJson(raw);
  const inc: Incoming = {
    method: req.method ?? 'GET',
    path: url.pathname,
    query: url.searchParams,
    headers: req.headers,
    body: parsed.value,
    bodyIsJson: parsed.ok,
  };

  let reply: Reply;
  if (inc.path.startsWith('/__control/')) {
    // Control routes are not recorded.
    reply = runControl(inc);
  } else if (inc.method === 'GET' && inc.path.startsWith('/assets/')) {
    // Static assets are not recorded: browsers fetch them and would evict real records.
    reply = await assetReply(decodeParam(inc.path.slice('/assets/'.length)));
  } else {
    const routed = route(inc);
    reply = await routed.reply;
    record({
      service: routed.service,
      endpoint: routed.endpoint,
      ...(routed.purpose === undefined ? {} : { purpose: routed.purpose }),
      method: inc.method,
      path: inc.path,
      headers: recordedHeaders(inc, routed.service),
      body: parsed.ok ? parsed.value : null,
      status: reply.status,
    });
  }
  console.log(`${inc.method} ${inc.path} ${String(reply.status)}`);
  if (reply.delayMs > 0) await sleep(reply.delayMs);
  send(res, reply);
}

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.log(`stub error: ${error instanceof Error ? error.message : 'unknown'}`);
    if (!res.headersSent) send(res, json(500, { message: 'stub: internal error' }));
    else res.destroy();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`stub server listening on :${String(PORT)}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
