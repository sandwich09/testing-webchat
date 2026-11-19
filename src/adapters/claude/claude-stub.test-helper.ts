// Test-only harness for the Claude adapter specs: calls to the control routes of the stub
// (docs/qa/stubs-and-fixtures.md section 6). Not imported by application code.
import { type AddressInfo, createServer } from 'node:net';
import {
  CLAUDE_EXTRACT_MAX_RETRIES,
  CLAUDE_GUARD_MAX_RETRIES,
  CLAUDE_REPLY_MAX_RETRIES,
} from './claude.constants';

export const STUB_ANTHROPIC_KEY = 'stub-anthropic-key';

/**
 * A base URL on a local port nothing listens on, so the connection is refused before anything is
 * sent. A port of the fetch "bad port" list (such as 9) fails differently, without a code.
 */
export const refusedBaseUrl = async (): Promise<string> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo; // listen() on a TCP port gives an AddressInfo
  await new Promise<void>((resolve, reject) => {
    server.close((e) => {
      if (e) reject(e);
      else resolve();
    });
  });
  return `http://127.0.0.1:${String(port)}/anthropic`;
};

export type StubPurpose = 'guard' | 'reply' | 'extract' | 'count_tokens';

export interface RecordedClaudeRequest {
  seq: number;
  endpoint: string;
  purpose?: StubPurpose;
  path: string;
  headers: {
    authorization: 'bearer' | 'missing' | 'other';
    xApiKey?: 'present' | 'missing';
    anthropicVersion?: string;
    anthropicBeta?: string;
  };
  body: Record<string, unknown>;
  status: number;
}

type StubEndpoint = 'messages' | 'count_tokens';

export interface StubFailure {
  status: number;
  errorType: string;
  times?: number;
  endpoint?: StubEndpoint;
  match?: string;
}

/** Control routes of the stub at `stubUrl`. */
export const createStubControl = (stubUrl: string) => {
  const call = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${stubUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`stub control ${path} answered ${String(response.status)}`);
    return response.json();
  };

  return {
    baseURL: `${stubUrl}/anthropic`,
    reset: () => call('/__control/reset', {}),
    nextReply: (body: Record<string, unknown>) => call('/__control/claude/next-reply', body),
    failNext: (body: StubFailure) => call('/__control/claude/fail-next', body),
    delayNext: (body: { ms: number; times?: number; endpoint?: StubEndpoint; match?: string }) =>
      call('/__control/claude/delay-next', body),
    async requests(purpose?: StubPurpose): Promise<RecordedClaudeRequest[]> {
      const query = purpose === undefined ? '' : `?purpose=${purpose}`;
      // The response shape is defined by the stub (stubs-and-fixtures section 6).
      const data = (await call(`/__control/claude/requests${query}`)) as {
        items: RecordedClaudeRequest[];
      };
      return data.items;
    },
    async lastRequest(): Promise<RecordedClaudeRequest> {
      const last = (await this.requests()).at(-1);
      if (last === undefined) throw new Error('the stub received no request');
      return last;
    },
  };
};

/** Every attempt of one call: the SDK retries 5xx and 429. */
const ALL_ATTEMPTS =
  Math.max(CLAUDE_REPLY_MAX_RETRIES, CLAUDE_EXTRACT_MAX_RETRIES, CLAUDE_GUARD_MAX_RETRIES) + 1;

/** The stub's answer for each port error code. */
export const STUB_ERRORS = {
  'ai.unavailable': { status: 529, errorType: 'overloaded_error', times: ALL_ATTEMPTS },
  'ai.rate_limited': { status: 429, errorType: 'rate_limit_error', times: ALL_ATTEMPTS },
  'ai.auth_failed': { status: 401, errorType: 'authentication_error', times: 1 },
  'ai.bad_request': { status: 400, errorType: 'invalid_request_error', times: 1 },
} as const;
