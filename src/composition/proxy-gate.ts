import { NextResponse, type NextRequest } from 'next/server';
import type { IdGenerator, Logger } from '@/core/ports';
import type { UseCase } from '@/core/use-cases';
import type { VerifyAccessInput } from '@/core/use-cases';
import { buildContentSecurityPolicy } from './csp';
import type { HttpErrorCode } from './http-errors';
import { errorResponse, readAccessToken } from './http-response';
import { isAllowedOrigin } from './request-origin';

export interface ProxyGateDeps {
  verifyAccess: UseCase<VerifyAccessInput, void, 'access.unauthorized'>;
  ids: Pick<IdGenerator, 'requestId'>;
  logger: Logger;
  /** Origin of APP_BASE_URL; same-origin requests pass too (request-origin.ts). */
  appOrigin: string;
  development: boolean;
  nonce: () => string;
  /** Milliseconds for durationMs; defaults to performance.now. */
  now?: () => number;
}

export const WELCOME_PATH = '/welcome';

/**
 * Requests that skip the cookie check, from specs/access-gate.md item 6 and the proxy.ts
 * section of project-setup, matched on the exact method and path.
 */
const isCookieExempt = (method: string, pathname: string): boolean =>
  (method === 'POST' && pathname === '/api/line/webhook') ||
  (method === 'GET' && pathname === '/api/health') ||
  (method === 'POST' && pathname === '/api/access/unlock') ||
  // GET /api/local-storage/*key is open in api-contract: LINE fetches outbound media from it
  // without a cookie. HEAD is how Next.js serves a GET handler to a HEAD request.
  ((method === 'GET' || method === 'HEAD') && pathname.startsWith('/api/local-storage/')) ||
  pathname === WELCOME_PATH;

/**
 * Step 1 lets exempt requests through before the origin check too: the webhook has none, and
 * POST /api/access/unlock is checked by its route (withRoute, `access: 'open'`).
 */
const isOriginExempt = isCookieExempt;

const isApi = (pathname: string): boolean => pathname === '/api' || pathname.startsWith('/api/');

const isSafeMethod = (method: string): boolean => method === 'GET' || method === 'HEAD';

/**
 * The cookie gate, origin check and CSP of every request that is not a static asset
 * (project-setup "proxy.ts"):
 *
 * 1. Exempt paths pass the gate.
 * 2. `/api/*` that is not GET or HEAD needs `Origin` equal to the request's own origin or to
 *    the origin of APP_BASE_URL (`isAllowedOrigin`): else 403.
 * 3. The cookie goes through VerifyAccess (AccessTokenSigner). Else `/api/*` gets 401 and a
 *    page is rewritten to /welcome with the URL unchanged.
 * 4. Every response gets the CSP with a fresh nonce; pages also get it as request headers
 *    (`Content-Security-Policy`, `x-nonce`) so Next.js puts the nonce on its scripts.
 */
export const makeProxyGate = (deps: ProxyGateDeps) => {
  const now = deps.now ?? (() => performance.now());

  const reject = (
    code: HttpErrorCode,
    method: string,
    started: number,
    requestId = deps.ids.requestId(),
  ): NextResponse => {
    const response = errorResponse({ code }, requestId);
    deps.logger.log('info', 'http.request.completed', {
      requestId,
      method,
      httpStatus: response.status,
      durationMs: Math.round(now() - started),
      errorCode: code,
    });
    const out = new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
    out.headers.set('Cache-Control', 'no-store');
    out.headers.set('x-request-id', requestId);
    return out;
  };

  return async (request: NextRequest): Promise<NextResponse> => {
    const started = now();
    const { method } = request;
    const { pathname } = request.nextUrl;
    const api = isApi(pathname);
    const nonce = deps.nonce();
    const csp = buildContentSecurityPolicy(nonce, { development: deps.development });
    const withCsp = (response: NextResponse): NextResponse => {
      response.headers.set('Content-Security-Policy', csp);
      return response;
    };

    if (api && !isSafeMethod(method) && !isOriginExempt(method, pathname)) {
      if (!isAllowedOrigin(request, deps.appOrigin)) {
        const requestId = deps.ids.requestId();
        deps.logger.log('warn', 'http.origin.rejected', { requestId, method });
        return withCsp(reject('request.origin_forbidden', method, started, requestId));
      }
    }

    let allowed = isCookieExempt(method, pathname);
    if (!allowed) {
      const token = readAccessToken(request.headers);
      // The request id of the gate itself; the route makes its own for the real answer.
      const verified = await deps.verifyAccess(
        { token },
        { requestId: deps.ids.requestId(), clientIp: null },
      );
      allowed = verified.ok;
    }

    if (api) {
      return withCsp(
        allowed ? NextResponse.next() : reject('access.unauthorized', method, started),
      );
    }

    // Pages: the nonce travels to the renderer through request headers. Values sent by the
    // browser under these names are overwritten, never trusted.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    const forward = { request: { headers: requestHeaders } };
    return withCsp(
      allowed
        ? NextResponse.next(forward)
        : NextResponse.rewrite(new URL(WELCOME_PATH, request.url), forward),
    );
  };
};
