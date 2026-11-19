import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { err, ok, PRICE_TABLE, type Result } from '@/core/domain';
import { makeVerifyAccess, type UseCaseConfig } from '@/core/use-cases';
import { FakeAccessTokenSigner, FakeClock, FakeIdGenerator, FakeLogger } from '@/adapters/fakes';
import { errorResponseSchema } from '@/contracts';
import { makeRunJob, makeWithRoute, type RouteDeps } from './route';
import { fail, json } from './http-response';
import type { HttpErrorCode } from './http-errors';

const ORIGIN = 'http://localhost:3000';
const config: UseCaseConfig = {
  appBaseUrl: ORIGIN,
  aiDebounceMs: 1,
  aiStuckAfterMs: 1,
  pollIntervalMs: 1,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};

let clock: FakeClock;
let signer: FakeAccessTokenSigner;
let logger: FakeLogger;
let deps: RouteDeps;
let withRoute: ReturnType<typeof makeWithRoute>;
let token: string;

beforeEach(() => {
  clock = new FakeClock();
  signer = new FakeAccessTokenSigner();
  logger = new FakeLogger(clock);
  deps = {
    verifyAccess: makeVerifyAccess({ signer, clock }, config),
    ids: new FakeIdGenerator(),
    logger,
    appOrigin: ORIGIN,
  };
  withRoute = makeWithRoute(() => deps);
  token = signer.issue(clock.now()).token;
});

const noParams = { params: Promise.resolve({}) };

const request = (
  method: string,
  init: {
    path?: string;
    origin?: string | null;
    cookie?: string | null;
    body?: string;
    type?: string;
  } = {},
): Request => {
  const headers = new Headers();
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
  if (init.cookie !== null) headers.set('cookie', init.cookie ?? `twa_access=${token}`);
  if (init.type !== undefined) headers.set('content-type', init.type);
  return new Request(`${ORIGIN}${init.path ?? '/api/x'}`, { method, headers, body: init.body });
};

const errorOf = async (r: Response) => errorResponseSchema.parse(await r.json()).error;

/** A handler written the way routes are: await the use case, return its failure as is. */
const viaUseCase = (result: Result<unknown, HttpErrorCode>) => async () => {
  const r = await Promise.resolve(result);
  if (!r.ok) return r;
  return json({});
};

describe('withRoute: access and origin', () => {
  const ok200 = () => json({ done: true });

  it('runs the handler for a valid cookie and same-origin request', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ok200);
    const r = await handler(request('POST'), noParams);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ done: true });
  });

  it.each([
    ['no cookie', { cookie: null }],
    ['a tampered cookie', { cookie: 'twa_access=1.abc' }],
  ])('answers 401 access.unauthorized with %s', async (_label, init) => {
    let called = false;
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, () => {
      called = true;
      return json({});
    });
    const r = await handler(request('GET', init), noParams);
    expect(r.status).toBe(401);
    expect((await errorOf(r)).code).toBe('access.unauthorized');
    expect(called).toBe(false);
  });

  it('answers 401 once the cookie has expired', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ok200);
    clock.advance(7 * 24 * 3600 * 1000);
    expect((await handler(request('GET'), noParams)).status).toBe(401);
  });

  it.each([
    ['another origin', 'https://evil.example'],
    ['no Origin header', null],
    ['the literal null origin', 'null'],
    ['a different port', 'http://localhost:3001'],
  ])('answers 403 request.origin_forbidden for a POST from %s and logs it', async (_l, origin) => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ok200);
    const r = await handler(request('POST', { origin }), noParams);
    expect(r.status).toBe(403);
    expect((await errorOf(r)).code).toBe('request.origin_forbidden');
    expect(logger.eventsOf('warn')).toContain('http.origin.rejected');
    expect(logger.entries.find((e) => e.event === 'http.origin.rejected')).toMatchObject({
      route: '/api/x',
      method: 'POST',
    });
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('checks the origin of %s', async (method) => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ok200);
    expect(
      (await handler(request(method, { origin: 'https://evil.example' }), noParams)).status,
    ).toBe(403);
  });

  it('does not check the origin of GET', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ok200);
    expect((await handler(request('GET', { origin: null }), noParams)).status).toBe(200);
  });

  it('checks the origin before the cookie', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ok200);
    const r = await handler(
      request('POST', { origin: 'https://evil.example', cookie: null }),
      noParams,
    );
    expect(r.status).toBe(403);
  });

  it('open: no cookie needed, but the origin is still checked', async () => {
    const handler = withRoute({ route: '/api/access/unlock', access: 'open' }, ok200);
    expect((await handler(request('POST', { cookie: null }), noParams)).status).toBe(200);
    expect(
      (await handler(request('POST', { cookie: null, origin: 'https://evil.example' }), noParams))
        .status,
    ).toBe(403);
  });

  it('webhook: neither cookie nor origin, and LINE setup codes answer 401', async () => {
    const handler = withRoute(
      { route: '/api/line/webhook', access: 'webhook' },
      viaUseCase(err('line.not_configured')),
    );
    const r = await handler(request('POST', { cookie: null, origin: null }), noParams);
    expect(r.status).toBe(401);
    expect((await errorOf(r)).code).toBe('line.not_configured');
  });

  it('the same code answers 409 outside the webhook', async () => {
    const handler = withRoute(
      { route: '/api/settings/line/test', access: 'cookie' },
      viaUseCase(err('line.not_configured')),
    );
    expect((await handler(request('POST'), noParams)).status).toBe(409);
  });
});

describe('withRoute: schemas', () => {
  const params = z.strictObject({ id: z.string().min(2) });
  const query = z.strictObject({ n: z.string().regex(/^\d+$/).transform(Number).optional() });
  const body = z.strictObject({ text: z.string().min(1) });

  it('hands typed params, query and body to the handler', async () => {
    const handler = withRoute(
      { route: '/api/x/:id', access: 'cookie', params, query, body },
      (args) => json({ id: args.params.id, n: args.query.n, text: args.body.text }),
    );
    const r = await handler(
      request('POST', { path: '/api/x/ab?n=4', body: '{"text":"hi"}', type: 'application/json' }),
      { params: Promise.resolve({ id: 'ab' }) },
    );
    expect(await r.json()).toEqual({ id: 'ab', n: 4, text: 'hi' });
  });

  it.each([
    ['params', { path: '/api/x/a', body: '{"text":"hi"}' }, { id: 'a' }],
    ['query', { path: '/api/x/ab?zz=1', body: '{"text":"hi"}' }, { id: 'ab' }],
    ['body', { path: '/api/x/ab', body: '{"text":""}' }, { id: 'ab' }],
  ])('answers 400 request.invalid for bad %s without calling the handler', async (_l, init, p) => {
    let called = false;
    const handler = withRoute(
      { route: '/api/x/:id', access: 'cookie', params, query, body },
      () => {
        called = true;
        return json({});
      },
    );
    const r = await handler(request('POST', { ...init, type: 'application/json' }), {
      params: Promise.resolve(p),
    });
    expect(r.status).toBe(400);
    expect((await errorOf(r)).code).toBe('request.invalid');
    expect(called).toBe(false);
  });

  it('answers 413 request.too_large for a big JSON body', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie', body }, () => json({}));
    const r = await handler(
      request('POST', {
        body: JSON.stringify({ text: 'x'.repeat(70_000) }),
        type: 'application/json',
      }),
      noParams,
    );
    expect(r.status).toBe(413);
  });
});

describe('withRoute: results, headers and logs', () => {
  it('passes a failed use case result through with its catalog status and Retry-After', async () => {
    const handler = withRoute(
      { route: '/api/uploads', access: 'cookie' },
      viaUseCase(err('upload.rate_limited', 'detail stays inside', 12)),
    );
    const r = await handler(request('POST'), noParams);
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('12');
    const body = await r.text();
    expect(body).not.toContain('detail stays inside');
  });

  it('accepts fail(code) from the handler', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, () => fail('media.not_found'));
    expect((await handler(request('GET'), noParams)).status).toBe(404);
  });

  it('adds Cache-Control no-store and x-request-id to every answer, also errors', async () => {
    const good = withRoute({ route: '/api/x', access: 'cookie' }, () => json({}));
    const bad = withRoute({ route: '/api/x', access: 'cookie' }, () => json({}));
    for (const r of [
      await good(request('GET'), noParams),
      await bad(request('GET', { cookie: null }), noParams),
    ]) {
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(r.headers.get('x-request-id')).toMatch(/^req-\d+$/);
    }
  });

  it('uses the same request id in the header, the error body and the logs', async () => {
    const handler = withRoute(
      { route: '/api/x', access: 'cookie' },
      viaUseCase(err('contact.not_found')),
    );
    const r = await handler(request('GET'), noParams);
    const id = r.headers.get('x-request-id');
    expect((await errorOf(r)).requestId).toBe(id);
    expect(logger.entries.at(-1)).toMatchObject({
      event: 'http.request.completed',
      requestId: id,
      route: '/api/x',
      method: 'GET',
      httpStatus: 404,
      errorCode: 'contact.not_found',
    });
  });

  it('gives the handler a context with the request id and client IP', async () => {
    let seen: unknown;
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, ({ ctx }) => {
      seen = ctx;
      return json({});
    });
    const req = request('GET');
    req.headers.set('x-forwarded-for', '203.0.113.9');
    const r = await handler(req, noParams);
    expect(seen).toEqual({ requestId: r.headers.get('x-request-id'), clientIp: '203.0.113.9' });
  });

  it('logs http.request.completed once for a success', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, () => json({}));
    await handler(request('GET'), noParams);
    expect(logger.eventsOf()).toEqual(['http.request.completed']);
    expect(logger.entries[0]).toMatchObject({ httpStatus: 200 });
    expect(logger.entries[0]).not.toHaveProperty('errorCode');
  });

  it('turns a throw into 500 internal.unexpected, logging only the error class', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, () => {
      throw new TypeError('secret customer text in a message');
    });
    const r = await handler(request('GET'), noParams);
    expect(r.status).toBe(500);
    expect((await errorOf(r)).code).toBe('internal.unexpected');
    const failed = logger.entries.find((e) => e.event === 'http.request.failed');
    expect(failed).toMatchObject({ level: 'error', errorName: 'TypeError', route: '/api/x' });
    expect(JSON.stringify(logger.entries)).not.toContain('secret customer text');
    expect(logger.entries.at(-1)).toMatchObject({
      event: 'http.request.completed',
      httpStatus: 500,
    });
  });

  it('turns a code that is never an HTTP answer into 500 and logs it', async () => {
    const handler = withRoute(
      { route: '/api/x', access: 'cookie' },
      () =>
        // Simulates a use case that leaks a "—" code; the types forbid it in real routes.
        ({ ok: false, error: { code: 'line.push_failed' } }) as never,
    );
    const r = await handler(request('GET'), noParams);
    expect(r.status).toBe(500);
    expect((await errorOf(r)).code).toBe('internal.unexpected');
    expect(logger.entries.find((e) => e.event === 'http.request.failed')).toMatchObject({
      errorCode: 'line.push_failed',
    });
  });

  it('keeps a handler Response with frozen headers working', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, () =>
      Response.redirect(`${ORIGIN}/welcome`, 307),
    );
    const r = await handler(request('GET'), noParams);
    expect(r.status).toBe(307);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('location')).toBe(`${ORIGIN}/welcome`);
  });

  it('returns a successful use case value only through the handler', async () => {
    const handler = withRoute({ route: '/api/x', access: 'cookie' }, async () => {
      const r = await Promise.resolve(ok({ n: 1 }));
      return r.ok ? json(r.value) : r;
    });
    expect(await (await handler(request('GET'), noParams)).json()).toEqual({ n: 1 });
  });
});

describe('makeRunJob', () => {
  it('schedules the job and swallows a throw with job.run.failed', async () => {
    const tasks: (() => Promise<void>)[] = [];
    const runJob = makeRunJob({ schedule: (t) => tasks.push(t), logger: () => logger });
    let ran = false;
    runJob(
      () => {
        ran = true;
        return Promise.resolve();
      },
      { requestId: 'r1' },
    );
    runJob(
      () => {
        throw new RangeError('private detail');
      },
      { requestId: 'r2', route: '/api/line/webhook', messageId: 'm' as never },
    );
    expect(ran).toBe(false);
    for (const t of tasks) await t();
    expect(ran).toBe(true);
    expect(logger.entries).toEqual([
      expect.objectContaining({
        level: 'error',
        event: 'job.run.failed',
        requestId: 'r2',
        route: '/api/line/webhook',
        messageId: 'm',
        errorName: 'RangeError',
      }),
    ]);
    expect(JSON.stringify(logger.entries)).not.toContain('private detail');
  });

  it('logs an error whose class name is not a plain identifier as UnknownError', async () => {
    const tasks: (() => Promise<void>)[] = [];
    const runJob = makeRunJob({ schedule: (t) => tasks.push(t), logger: () => logger });
    const odd = new Error('x');
    odd.name = 'name with <customer text>';
    runJob(() => Promise.reject(odd), { requestId: 'r' });
    await tasks[0]?.();
    expect(logger.entries[0]).toMatchObject({ errorName: 'UnknownError' });
  });
});
