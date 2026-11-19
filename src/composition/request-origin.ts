/**
 * The origin check of every `/api/*` request that is not GET or HEAD, shared by proxy.ts
 * (proxy-gate.ts) and the route wrapper (route.ts). Rule: api-contract "ต้นทาง" and ADR 0025.
 *
 * A request passes when its `Origin` header is a serialised http(s) origin equal to either
 * - the origin the browser used to reach this server (same-origin), or
 * - the origin of APP_BASE_URL.
 * A missing header, `Origin: null` and anything that is not a bare origin fail.
 *
 * Trust assumption of the same-origin half: the request's own origin is read from
 * `x-forwarded-host` (else `Host`) and `x-forwarded-proto` (else the scheme of `request.url`).
 * Behind Vercel these are written by Vercel's proxy. Without a proxy (Docker, `next start`)
 * Next.js fills `x-forwarded-host` from `Host` and `x-forwarded-proto` from the socket, unless
 * the client sent them. A cross-site page cannot forge them: browsers never let a page set
 * `Host`, and a page that sets an `X-Forwarded-*` header makes its request non-simple, so the
 * browser sends a CORS preflight first, which this app never answers with
 * `Access-Control-Allow-Headers`, and the real request is never sent. A non-browser client can
 * set every header, Origin included, but it holds no admin cookie: this check defends against
 * cross-site requests made by an admin's browser, not against scripts.
 */

/** host, host:port, a trailing-dot name or a bracketed IPv6 literal; nothing else. */
const HOST = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

/** First value of a header that a proxy chain may have turned into a comma-separated list. */
const firstValue = (value: string | null): string | undefined => {
  const first = value?.split(',')[0]?.trim();
  return first === undefined || first === '' ? undefined : first;
};

const isHttp = (protocol: string): boolean => protocol === 'http:' || protocol === 'https:';

/**
 * The `Origin` header as a canonical origin, or null when it is missing, `null`, not http(s),
 * or not a bare origin (a path, credentials or an explicit default port). Host case is ignored.
 */
export const parseOriginHeader = (value: string | null): string | null => {
  if (value === null) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!isHttp(url.protocol)) return null;
  return url.origin === value.toLowerCase() ? url.origin : null;
};

/** The origin the client used to reach this server, or null when the headers do not say. */
export const requestOwnOrigin = (request: { headers: Headers; url: string }): string | null => {
  const { headers } = request;
  const host = firstValue(headers.get('x-forwarded-host')) ?? firstValue(headers.get('host'));
  if (host === undefined || !HOST.test(host)) return null;
  const forwardedProto = firstValue(headers.get('x-forwarded-proto'));
  let protocol: string;
  try {
    protocol = forwardedProto === undefined ? new URL(request.url).protocol : `${forwardedProto}:`;
  } catch {
    return null;
  }
  protocol = protocol.toLowerCase();
  if (!isHttp(protocol)) return null;
  try {
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
};

/** True when a non-GET/HEAD request may go on: see the rule at the top of this file. */
export const isAllowedOrigin = (
  request: { headers: Headers; url: string },
  appOrigin: string,
): boolean => {
  const origin = parseOriginHeader(request.headers.get('origin'));
  if (origin === null) return false;
  return origin === appOrigin || origin === requestOwnOrigin(request);
};
