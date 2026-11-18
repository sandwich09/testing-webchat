import type { AppError } from '@/core/domain';
import { ACCESS_COOKIE_TTL_MS } from '@/core/domain';
import { describeError, type HttpErrorCode } from './http-errors';

/** A failed step of a route. Same shape as the failure side of a use case `Result`. */
export interface RouteFailure {
  ok: false;
  error: AppError<HttpErrorCode>;
}

/** A route failure with a code from the error catalog. */
export const fail = (code: HttpErrorCode, retryAfterSeconds?: number): RouteFailure => ({
  ok: false,
  error: { code, retryAfterSeconds },
});

export const isRouteFailure = (value: unknown): value is RouteFailure =>
  typeof value === 'object' &&
  value !== null &&
  !(value instanceof Response) &&
  'ok' in value &&
  value.ok === false &&
  'error' in value;

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

/** JSON response. `body` must already be a DTO (bigint and Date are not JSON). */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
  });

/** 204 with no body. */
export const noContent = (): Response => new Response(null, { status: 204 });

/** The api-contract error body with its status, and Retry-After when the error carries one. */
export const errorResponse = (
  error: Pick<AppError, 'code' | 'retryAfterSeconds'>,
  requestId: string,
  overrides: Partial<Record<HttpErrorCode, number>> = {},
): Response => {
  const { status, body } = describeError(error, requestId, overrides);
  const response = json(body, status);
  if (status === 429 && error.retryAfterSeconds !== undefined) {
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
  }
  return response;
};

// ---------------------------------------------------------------------------
// Access cookie (api-contract "Cookie")
// ---------------------------------------------------------------------------

export const ACCESS_COOKIE_NAME = 'twa_access';
const ACCESS_COOKIE_MAX_AGE_S = Math.floor(ACCESS_COOKIE_TTL_MS / 1000);
const COOKIE_ATTRIBUTES = 'HttpOnly; Secure; SameSite=Lax; Path=/';
/** Token alphabet of every AccessTokenSigner: anything else cannot be a token we issued. */
const TOKEN_VALUE = /^[A-Za-z0-9._-]{1,256}$/;

/** `Set-Cookie` value that stores the access token. */
export const accessCookieHeader = (token: string): string => {
  if (!TOKEN_VALUE.test(token)) throw new Error('Access token has characters a cookie cannot hold');
  return `${ACCESS_COOKIE_NAME}=${token}; ${COOKIE_ATTRIBUTES}; Max-Age=${String(ACCESS_COOKIE_MAX_AGE_S)}`;
};

/** `Set-Cookie` value that removes the access cookie. */
export const clearedAccessCookieHeader = (): string =>
  `${ACCESS_COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;

/** The access token from the Cookie header, or null. Only the first `twa_access` counts. */
export const readAccessToken = (headers: Headers): string | null => {
  const cookie = headers.get('cookie');
  if (cookie === null) return null;
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== ACCESS_COOKIE_NAME) continue;
    const value = part.slice(eq + 1).trim();
    return TOKEN_VALUE.test(value) ? value : null;
  }
  return null;
};

/** POST /api/access/unlock success: 204 with the cookie. */
export const accessGrantedResponse = (token: string): Response => {
  const response = noContent();
  response.headers.append('Set-Cookie', accessCookieHeader(token));
  return response;
};

/** POST /api/access/lock: 204 that clears the cookie. */
export const accessClearedResponse = (): Response => {
  const response = noContent();
  response.headers.append('Set-Cookie', clearedAccessCookieHeader());
  return response;
};
