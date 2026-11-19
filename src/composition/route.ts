import type { z } from 'zod';
import type { AppError } from '@/core/domain';
import type { IdGenerator, Logger, LogFields } from '@/core/ports';
import type { RequestContext, UseCase, VerifyAccessInput } from '@/core/use-cases';
import { WEBHOOK_STATUS_OVERRIDES, type HttpErrorCode } from './http-errors';
import { clientIpOf, parseJsonBody, parseParams, parseQuery } from './http-request';
import { errorResponse, isRouteFailure, readAccessToken, type RouteFailure } from './http-response';
import { isAllowedOrigin } from './request-origin';

/**
 * Who may call a route (api-contract "การเข้าระบบ" and "ต้นทาง"):
 * - `cookie`: VerifyAccess on the `twa_access` cookie, and `isAllowedOrigin` unless GET/HEAD
 *   (Origin equals the request's own origin or the origin of APP_BASE_URL).
 * - `open`: no cookie (health, unlock, local-storage), Origin still checked unless GET/HEAD.
 * - `webhook`: POST /api/line/webhook only. No cookie, no Origin; the use case checks the LINE
 *   signature, and `line.not_configured` / `line.credentials_unreadable` answer 401.
 */
export type RouteAccess = 'cookie' | 'open' | 'webhook';

export interface RouteOptions<P, Q, B> {
  /** Route template for logs, e.g. "/api/contacts/:id". Never the real path. */
  route: string;
  access: RouteAccess;
  /** Contract schema of the path params. Failing it answers 400 request.invalid. */
  params?: z.ZodType<P>;
  /** Contract schema of the query string. */
  query?: z.ZodType<Q>;
  /** Contract schema of a JSON body (Content-Type application/json, at most JSON_MAX_BODY_BYTES). */
  body?: z.ZodType<B>;
}

export interface RouteArgs<P, Q, B> {
  /** The raw request: for the webhook text, a multipart PDF or a streamed upload body. */
  request: Request;
  /** Pass to every use case. */
  ctx: RequestContext;
  params: P;
  query: Q;
  body: B;
}

/** What a handler returns: a Response, or a failure (a use case error passes straight through). */
export type RouteOutcome = Response | RouteFailure;

/** Signature Next.js calls; assignable to every `RouteHandlerConfig` method of `next typegen`. */
export type NextRouteHandler = (
  request: Request,
  context: { params: Promise<unknown> },
) => Promise<Response>;

export interface RouteDeps {
  verifyAccess: UseCase<VerifyAccessInput, void, 'access.unauthorized'>;
  ids: Pick<IdGenerator, 'requestId'>;
  logger: Logger;
  /** Origin of APP_BASE_URL; same-origin requests pass too (request-origin.ts). */
  appOrigin: string;
}

const isSafeMethod = (method: string): boolean => method === 'GET' || method === 'HEAD';

const errorNameOf = (e: unknown): string =>
  e instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(e.name) ? e.name : 'UnknownError';

/** Cache-Control and x-request-id on every answer. Rebuilds a Response whose headers are frozen. */
const finish = (response: Response, requestId: string): Response => {
  let out = response;
  try {
    out.headers.set('Cache-Control', 'no-store');
  } catch {
    out = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    out.headers.set('Cache-Control', 'no-store');
  }
  out.headers.set('x-request-id', requestId);
  return out;
};

/**
 * Builds `withRoute` over the given dependencies. Production code uses the `withRoute` exported
 * by `@/composition`, which takes them from the container on each request.
 */
export const makeWithRoute =
  (getDeps: () => RouteDeps) =>
  <P = undefined, Q = undefined, B = undefined>(
    options: RouteOptions<P, Q, B>,
    handler: (args: RouteArgs<P, Q, B>) => RouteOutcome | Promise<RouteOutcome>,
  ): NextRouteHandler =>
  async (request, context) => {
    const started = performance.now();
    const deps = getDeps();
    const requestId = deps.ids.requestId();
    const ctx: RequestContext = { requestId, clientIp: clientIpOf(request.headers) };
    const overrides: Partial<Record<HttpErrorCode, number>> =
      options.access === 'webhook' ? WEBHOOK_STATUS_OVERRIDES : {};
    const log: LogFields = { requestId, route: options.route, method: request.method };

    const run = async (): Promise<RouteOutcome> => {
      if (options.access !== 'webhook' && !isSafeMethod(request.method)) {
        if (!isAllowedOrigin(request, deps.appOrigin)) {
          deps.logger.log('warn', 'http.origin.rejected', log);
          return { ok: false, error: { code: 'request.origin_forbidden' } };
        }
      }
      if (options.access === 'cookie') {
        const verified = await deps.verifyAccess({ token: readAccessToken(request.headers) }, ctx);
        if (!verified.ok) return verified;
      }

      const params = options.params ? parseParams(options.params, await context.params) : null;
      if (params && !params.ok) return params;
      const query = options.query ? parseQuery(options.query, request) : null;
      if (query && !query.ok) return query;
      const body = options.body ? await parseJsonBody(options.body, request) : null;
      if (body && !body.ok) return body;

      return handler({
        request,
        ctx,
        // Without a schema the generic stays `undefined` (its default), and so does the value.
        params: (params ? params.value : undefined) as P,
        query: (query ? query.value : undefined) as Q,
        body: (body ? body.value : undefined) as B,
      });
    };

    let response: Response;
    let errorCode: AppError['code'] | undefined;
    try {
      const outcome = await run();
      if (isRouteFailure(outcome)) {
        response = errorResponse(outcome.error, requestId, overrides);
        errorCode = outcome.error.code;
        if (response.status === 500 && errorCode !== 'internal.unexpected') {
          // A code the catalog never answers over HTTP reached a route: a bug, logged as one.
          deps.logger.log('error', 'http.request.failed', { ...log, errorCode });
          errorCode = 'internal.unexpected';
        }
      } else {
        response = outcome;
      }
    } catch (e) {
      deps.logger.log('error', 'http.request.failed', { ...log, errorName: errorNameOf(e) });
      errorCode = 'internal.unexpected';
      response = errorResponse({ code: 'internal.unexpected' }, requestId);
    }

    deps.logger.log(response.status >= 500 ? 'error' : 'info', 'http.request.completed', {
      ...log,
      httpStatus: response.status,
      durationMs: Math.round(performance.now() - started),
      errorCode,
    });
    return finish(response, requestId);
  };

// ---------------------------------------------------------------------------
// After-response jobs (use-cases "การประกอบ")
// ---------------------------------------------------------------------------

/** Ids a failed job logs so it can be traced; never message text or customer data. */
export type JobFields = Pick<
  LogFields,
  'requestId' | 'route' | 'contactId' | 'messageId' | 'documentId'
>;

export type RunJob = (job: () => Promise<unknown>, fields: JobFields) => void;

/**
 * Builds `runJob`: hands the job to `schedule` (Next.js `after()` in production) and catches
 * anything it throws, logging `job.run.failed`. A job never breaks the response or the process.
 */
export const makeRunJob =
  (deps: { schedule: (task: () => Promise<void>) => void; logger: () => Logger }): RunJob =>
  (job, fields) => {
    deps.schedule(async () => {
      try {
        await job();
      } catch (e) {
        deps.logger().log('error', 'job.run.failed', { ...fields, errorName: errorNameOf(e) });
      }
    });
  };
