/**
 * Calls to the control routes of the stub server (docs/qa/stubs-and-fixtures.md section 6).
 * The stub lives at `E2E_STUB_URL` (default `http://localhost:4010`).
 */

export type LineMatch = { to?: string; userId?: string; messageId?: string; replyToken?: string };

export type StubClaudePurpose = 'guard' | 'reply' | 'extract' | 'count_tokens';

export type RecordedRequest = {
  seq: number;
  at: string;
  service: 'line' | 'line-data' | 'claude';
  endpoint: string;
  /** Only for service `claude` (section 5.3). */
  purpose?: StubClaudePurpose;
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

/**
 * A profile the stub's `profile` route returns. Without `pictureUrl` (or with `null`) the profile
 * has no picture, which is the default of the stub. Pass a URL only on an origin the app's CSP
 * allows for `img-src` (for example `https://profile.line-scdn.net/...` routed to a fixture with
 * `page.route`); a picture on the stub's own origin is blocked and logs a console error.
 */
export type StubLineProfile = { userId: string; displayName: string; pictureUrl?: string | null };

export type StubLineFailNext = {
  endpoint: string;
  match?: LineMatch;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  times?: number;
};

export type StubLineDelayNext = { endpoint: string; match?: LineMatch; ms: number; times?: number };

export type StubLineRequestsQuery = { endpoint?: string; to?: string; since?: number };

/**
 * Bytes that `content` (and `content/preview`) return for one message id, instead of the
 * prefix-based files. A seeded id without `preview` answers 404 on `content/preview`.
 */
export type StubLineContent = {
  messageId: string;
  data: Uint8Array;
  contentType: string;
  preview?: Uint8Array;
  /** Default `image/jpeg`. */
  previewContentType?: string;
  /** Default true. False streams the body chunked without `Content-Length`. */
  sendContentLength?: boolean;
};

export type StubClaudeNextReply = {
  match?: string;
  /** Without it, `json` with an `allowed` property counts as `guard`. */
  kind?: 'reply' | 'extract' | 'guard';
  json?: unknown;
  text?: string;
  stopReason?: string;
  model?: string;
  usage?: unknown;
  withThinkingBlock?: boolean;
  times?: number;
};

export type StubClaudeEndpoint = 'messages' | 'count_tokens';

export type StubClaudeFailNext = {
  match?: string;
  /** Default `messages`. */
  endpoint?: StubClaudeEndpoint;
  status: number;
  errorType: string;
  times?: number;
};

export type StubClaudeDelayNext = {
  match?: string;
  /** Default `messages`. */
  endpoint?: StubClaudeEndpoint;
  ms: number;
  times?: number;
};

export type StubClaudeCountTokens = { value: number; times?: number };

export type StubClaudeRequestsQuery = {
  match?: string;
  purpose?: StubClaudePurpose;
  since?: number;
};

export function stubBaseUrl(): string {
  return (process.env.E2E_STUB_URL ?? 'http://localhost:4010').replace(/\/+$/, '');
}

async function stubCall(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${stubBaseUrl()}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Stub ${method} ${path} failed with status ${String(response.status)}`);
  }
  const text = await response.text();
  return text === '' ? null : (JSON.parse(text) as unknown);
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs === '' ? path : `${path}?${qs}`;
}

async function stubItems(path: string): Promise<RecordedRequest[]> {
  // The stub's own response shape is documented in section 6: { items: RecordedRequest[] }.
  const result = (await stubCall('GET', path)) as { items: RecordedRequest[] };
  return result.items;
}

/** Clears queues, recorded requests, used reply tokens, retry keys and profiles. Call once in global setup. */
export async function stubReset(): Promise<void> {
  await stubCall('POST', '/__control/reset');
}

export async function stubLineProfile(p: StubLineProfile): Promise<void> {
  await stubCall('POST', '/__control/line/profiles', p);
}

export async function stubLineFailNext(o: StubLineFailNext): Promise<void> {
  await stubCall('POST', '/__control/line/fail-next', o);
}

export async function stubLineDelayNext(o: StubLineDelayNext): Promise<void> {
  await stubCall('POST', '/__control/line/delay-next', o);
}

export async function stubLineContent(c: StubLineContent): Promise<void> {
  const { data, preview, ...rest } = c;
  await stubCall('POST', '/__control/line/content', {
    ...rest,
    data: Buffer.from(data).toString('base64'),
    ...(preview === undefined ? {} : { preview: Buffer.from(preview).toString('base64') }),
  });
}

export function stubLineRequests(q: StubLineRequestsQuery = {}): Promise<RecordedRequest[]> {
  return stubItems(withQuery('/__control/line/requests', q));
}

export async function stubClaudeNextReply(o: StubClaudeNextReply): Promise<void> {
  await stubCall('POST', '/__control/claude/next-reply', o);
}

export async function stubClaudeFailNext(o: StubClaudeFailNext): Promise<void> {
  await stubCall('POST', '/__control/claude/fail-next', o);
}

export async function stubClaudeDelayNext(o: StubClaudeDelayNext): Promise<void> {
  await stubCall('POST', '/__control/claude/delay-next', o);
}

export async function stubClaudeCountTokens(o: StubClaudeCountTokens): Promise<void> {
  await stubCall('POST', '/__control/claude/count-tokens', o);
}

export function stubClaudeRequests(q: StubClaudeRequestsQuery = {}): Promise<RecordedRequest[]> {
  return stubItems(withQuery('/__control/claude/requests', q));
}
