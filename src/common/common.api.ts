// The one HTTP client of the screens (ui-screens 1.6) and the API functions shared by more than one
// feature. Every `*.api.ts` calls the server through `apiFetch`; no other file calls `fetch`.
import type { z } from 'zod';

import { CLIENT_REQUEST_TIMEOUT_MS } from '@/common/common.constants';
import type { ErrorMessageCode } from '@/common/error-messages';
import {
  errorResponseSchema,
  getSettingsResponseSchema,
  listCannedRepliesResponseSchema,
  listContactsResponseSchema,
  type CannedReplyDto,
  type ContactFilter,
  type ListContactsResponse,
  type SettingsDto,
} from '@/contracts';

/**
 * A failed call. `code` is the server error code, `client.network` when no answer came in time, or
 * `internal.unexpected` when the answer was not the documented body. `status` is 0 without an answer.
 */
export class ApiError extends Error {
  readonly code: ErrorMessageCode;
  readonly status: number;
  readonly requestId: string | null;

  constructor(code: ErrorMessageCode, status: number, requestId: string | null = null) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

/** A 4xx answer: asking again gives the same answer, so queries do not retry it. */
export function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** `retry` of queries that are not polled: once, and never after a 4xx (ui-screens 7.1). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !isClientError(error);
}

/** Error code of anything a call threw. Unknown errors count as `internal.unexpected`. */
export function errorCodeOf(error: unknown): ErrorMessageCode {
  return error instanceof ApiError ? error.code : 'internal.unexpected';
}

// ---------------------------------------------------------------------------
// 401 handling: `AppProviders` registers the handler; it runs once per registration however many
// requests come back 401 at the same time.
// ---------------------------------------------------------------------------

let unauthorizedHandler: (() => void) | null = null;
let unauthorizedFired = false;

/** Registers what to do on a 401 and re-arms it. Returns the function that removes it. */
export function setUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler;
  unauthorizedFired = false;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

function notifyUnauthorized(): void {
  if (unauthorizedHandler === null || unauthorizedFired) return;
  unauthorizedFired = true;
  unauthorizedHandler();
}

// ---------------------------------------------------------------------------
// apiFetch
// ---------------------------------------------------------------------------

type QueryValue = string | number | undefined;

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Query string; `undefined` values are left out. */
  query?: Record<string, QueryValue>;
  /** JSON body, or a `FormData` sent as multipart. */
  body?: unknown;
  /** Cancels the request (TanStack Query passes one). Cancelling rethrows the abort reason. */
  signal?: AbortSignal;
};

function buildUrl(path: string, query: Record<string, QueryValue> | undefined): string {
  if (query === undefined) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}

function requestInit(options: ApiFetchOptions, signal: AbortSignal): RequestInit {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  };
  if (options.body instanceof FormData) {
    // The browser sets the multipart boundary itself.
    init.body = options.body;
  } else if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  return init;
}

async function readErrorBody(
  response: Response,
): Promise<{ code: ErrorMessageCode; id: string | null }> {
  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));
  const header = response.headers.get('x-request-id');
  // An HTML error page or a proxy reply is not the documented body: an unexpected server error.
  if (!parsed.success) return { code: 'internal.unexpected', id: header };
  return { code: parsed.data.error.code, id: parsed.data.error.requestId };
}

async function send<T>(
  path: string,
  options: ApiFetchOptions,
  schema: z.ZodType<T> | null,
): Promise<T | undefined> {
  const callerSignal = options.signal;
  const signals = [AbortSignal.timeout(CLIENT_REQUEST_TIMEOUT_MS)];
  if (callerSignal !== undefined) signals.push(callerSignal);
  const signal = AbortSignal.any(signals);

  // A cancel from the caller is not a failure: rethrow it so the query layer drops it quietly.
  const noAnswer = (cause: unknown): never => {
    if (callerSignal?.aborted === true) throw callerSignal.reason ?? cause;
    throw new ApiError('client.network', 0);
  };

  let response: Response;
  try {
    // The single `fetch` of the screens (ui-screens 1.6). The lint glob for API files covers
    // src/features/**/*.api.ts only, so this file needs the exception.
    response = await fetch(buildUrl(path, options.query), requestInit(options, signal));
  } catch (cause) {
    return noAnswer(cause);
  }

  const requestId = response.headers.get('x-request-id');
  if (!response.ok) {
    let failure: { code: ErrorMessageCode; id: string | null };
    try {
      failure = await readErrorBody(response);
    } catch (cause) {
      return noAnswer(cause);
    }
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(failure.code, response.status, failure.id ?? requestId);
  }

  if (schema === null) return undefined;

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    if (signal.aborted) return noAnswer(cause);
    throw new ApiError('internal.unexpected', response.status, requestId);
  }
  const parsed = schema.safeParse(json);
  // An answer that is not the contract is an error state of the caller, never a crash.
  if (!parsed.success) throw new ApiError('internal.unexpected', response.status, requestId);
  return parsed.data;
}

/**
 * Calls an endpoint of the app and checks the answer with a schema from `src/contracts`.
 * Sends `credentials: "same-origin"` and `cache: "no-store"`. Throws `ApiError` on any failure;
 * a 401 also runs the registered unauthorized handler.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions & { schema: z.ZodType<T> },
): Promise<T> {
  return (await send(path, options, options.schema)) as T; // schema given: send returns T
}

/** Like `apiFetch` for endpoints that answer 204 (or any 2xx without a body the screen needs). */
export async function apiFetchNoContent(
  path: string,
  options: ApiFetchOptions = {},
): Promise<void> {
  await send(path, options, null);
}

// ---------------------------------------------------------------------------
// Endpoints used by more than one feature or by the shell (src/common may not import features).
// ---------------------------------------------------------------------------

/** GET /api/settings */
export function getSettings(signal?: AbortSignal): Promise<SettingsDto> {
  return apiFetch('/api/settings', { schema: getSettingsResponseSchema, signal });
}

/** GET /api/canned-replies */
export async function listCannedReplies(signal?: AbortSignal): Promise<CannedReplyDto[]> {
  const page = await apiFetch('/api/canned-replies', {
    schema: listCannedRepliesResponseSchema,
    signal,
  });
  return page.cannedReplies;
}

export type ContactsPage = ListContactsResponse;
export type ListContactsParams =
  { filter: ContactFilter; q?: string; before?: string } | { afterUpdatedSeq: string };

/**
 * GET /api/contacts, page mode or polling mode. Lives here rather than in `inbox.api.ts` because
 * the shell polls it on every page; `inbox.api.ts` re-exports it.
 */
export function listContacts(
  params: ListContactsParams,
  signal?: AbortSignal,
): Promise<ContactsPage> {
  const query: Record<string, QueryValue> =
    'afterUpdatedSeq' in params
      ? { afterUpdatedSeq: params.afterUpdatedSeq }
      : {
          filter: params.filter,
          // The server rejects an empty `q`; an empty search is no search.
          q: params.q === undefined || params.q === '' ? undefined : params.q,
          before: params.before,
        };
  return apiFetch('/api/contacts', { schema: listContactsResponseSchema, query, signal });
}

/** POST /api/access/lock, for the logout button of the shell; `access.api.ts` re-exports it. */
export function lock(): Promise<void> {
  return apiFetchNoContent('/api/access/lock', { method: 'POST' });
}
