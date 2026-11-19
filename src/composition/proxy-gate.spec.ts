import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PRICE_TABLE } from '@/core/domain';
import { makeVerifyAccess } from '@/core/use-cases';
import { FakeAccessTokenSigner, FakeClock, FakeIdGenerator, FakeLogger } from '@/adapters/fakes';
import { errorResponseSchema } from '@/contracts';
import { makeProxyGate } from './proxy-gate';

const ORIGIN = 'http://localhost:3000';

let clock: FakeClock;
let signer: FakeAccessTokenSigner;
let logger: FakeLogger;
let gate: ReturnType<typeof makeProxyGate>;
let token: string;
let nonces: number;

const build = (development = false, appOrigin = ORIGIN) =>
  makeProxyGate({
    verifyAccess: makeVerifyAccess(
      { signer, clock },
      {
        appBaseUrl: ORIGIN,
        aiDebounceMs: 1,
        aiStuckAfterMs: 1,
        pollIntervalMs: 1,
        rateLimitScale: 1,
        priceTable: PRICE_TABLE,
      },
    ),
    ids: new FakeIdGenerator(),
    logger,
    appOrigin,
    development,
    nonce: () => `nonce${String(++nonces)}`,
  });

beforeEach(() => {
  clock = new FakeClock();
  signer = new FakeAccessTokenSigner();
  logger = new FakeLogger(clock);
  nonces = 0;
  gate = build();
  token = signer.issue(clock.now()).token;
});

const req = (
  method: string,
  path: string,
  init: { cookie?: boolean; origin?: string | null; headers?: Record<string, string> } = {},
): NextRequest => {
  const headers = new Headers(init.headers);
  if (init.cookie ?? true) headers.set('cookie', `twa_access=${token}`);
  if (init.origin !== null && init.origin !== undefined) headers.set('origin', init.origin);
  return new NextRequest(`${ORIGIN}${path}`, { method, headers });
};

/** NextResponse.next() / rewrite() mark the outcome in these internal headers. */
const passedThrough = (r: Response) => r.headers.get('x-middleware-next') === '1';
const rewrittenTo = (r: Response) => r.headers.get('x-middleware-rewrite');
const forwardedRequestHeader = (r: Response, name: string) =>
  r.headers.get(`x-middleware-request-${name}`);

describe('proxy gate: API', () => {
  it('passes an authenticated GET through with the CSP header', async () => {
    const r = await gate(req('GET', '/api/contacts'));
    expect(passedThrough(r)).toBe(true);
    expect(r.headers.get('content-security-policy')).toContain("'nonce-nonce1'");
  });

  it('answers 401 access.unauthorized without a cookie, with no-store and x-request-id', async () => {
    const r = await gate(req('GET', '/api/contacts', { cookie: false }));
    expect(r.status).toBe(401);
    const body = errorResponseSchema.parse(await r.json());
    expect(body.error.code).toBe('access.unauthorized');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-request-id')).toBe(body.error.requestId);
    expect(r.headers.get('content-security-policy')).not.toBeNull();
    expect(logger.entries.at(-1)).toMatchObject({
      event: 'http.request.completed',
      httpStatus: 401,
      errorCode: 'access.unauthorized',
    });
  });

  it('answers 401 for an expired or forged cookie', async () => {
    clock.advance(8 * 24 * 3600 * 1000);
    expect((await gate(req('GET', '/api/settings'))).status).toBe(401);
    const forged = new NextRequest(`${ORIGIN}/api/settings`, {
      headers: { cookie: 'twa_access=99999999999999.AAAA' },
    });
    expect((await gate(forged)).status).toBe(401);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'answers 403 request.origin_forbidden for %s from another origin and logs it',
    async (method) => {
      const r = await gate(req(method, '/api/contacts/1', { origin: 'https://evil.example' }));
      expect(r.status).toBe(403);
      expect(errorResponseSchema.parse(await r.json()).error.code).toBe('request.origin_forbidden');
      expect(logger.entries.map((e) => e.event)).toEqual([
        'http.origin.rejected',
        'http.request.completed',
      ]);
      expect(logger.entries[0]).toMatchObject({ level: 'warn', method });
      expect(logger.entries[0]?.requestId).toBe(r.headers.get('x-request-id'));
    },
  );

  it('answers 403 for a POST without an Origin header, even with a valid cookie', async () => {
    expect((await gate(req('POST', '/api/contacts/1/read'))).status).toBe(403);
  });

  it('passes a same-origin POST with a cookie', async () => {
    expect(passedThrough(await gate(req('POST', '/api/contacts/1/read', { origin: ORIGIN })))).toBe(
      true,
    );
  });

  it('passes a same-origin POST when APP_BASE_URL is another origin', async () => {
    gate = build(false, 'https://configured.example');
    const headers = { host: 'localhost:3000' };
    const same = req('POST', '/api/contacts/1/read', { origin: ORIGIN, headers });
    expect(passedThrough(await gate(same))).toBe(true);
    const crossSite = req('POST', '/api/contacts/1/read', {
      origin: 'https://evil.example',
      headers,
    });
    expect((await gate(crossSite)).status).toBe(403);
  });

  it('checks the origin before the cookie', async () => {
    const r = await gate(req('POST', '/api/x', { cookie: false, origin: 'https://evil.example' }));
    expect(r.status).toBe(403);
  });

  it.each([
    ['POST', '/api/line/webhook'],
    ['GET', '/api/health'],
    ['POST', '/api/access/unlock'],
    ['GET', '/api/local-storage/out/a/b.jpg'],
    ['HEAD', '/api/local-storage/out/a/b.jpg'],
  ])('lets %s %s through without cookie or origin', async (method, path) => {
    const r = await gate(req(method, path, { cookie: false }));
    expect(passedThrough(r)).toBe(true);
  });

  it.each([
    ['GET', '/api/line/webhook'],
    ['POST', '/api/health'],
    ['GET', '/api/access/unlock'],
    ['GET', '/api/healthz'],
    ['GET', '/api/health/x'],
    ['POST', '/api/access/lock'],
    ['GET', '/api/local-storage'],
  ])('does not exempt %s %s', async (method, path) => {
    const r = await gate(req(method, path, { cookie: false, origin: ORIGIN }));
    expect(r.status).toBe(401);
  });

  it('keeps the cookie requirement on PUT /api/local-storage/*key', async () => {
    const r = await gate(
      req('PUT', '/api/local-storage/out/a.jpg', { cookie: false, origin: ORIGIN }),
    );
    expect(r.status).toBe(401);
  });
});

describe('proxy gate: pages', () => {
  it('rewrites a page without a cookie to /welcome, keeping the URL', async () => {
    const r = await gate(req('GET', '/chats/abc', { cookie: false }));
    expect(r.status).toBe(200);
    expect(rewrittenTo(r)).toBe(`${ORIGIN}/welcome`);
    expect(r.headers.get('location')).toBeNull();
  });

  it('passes a page with a valid cookie', async () => {
    expect(passedThrough(await gate(req('GET', '/settings')))).toBe(true);
  });

  it('serves /welcome without a cookie', async () => {
    const r = await gate(req('GET', '/welcome', { cookie: false }));
    expect(passedThrough(r)).toBe(true);
  });

  it('puts the nonce into the CSP response header and both request headers', async () => {
    const r = await gate(
      req('GET', '/chats', {
        headers: { 'x-nonce': 'attacker', 'content-security-policy': 'none' },
      }),
    );
    const csp = r.headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self' 'nonce-nonce1' 'strict-dynamic'");
    expect(forwardedRequestHeader(r, 'x-nonce')).toBe('nonce1');
    expect(forwardedRequestHeader(r, 'content-security-policy')).toBe(csp);
  });

  it('uses a fresh nonce per request', async () => {
    const a = await gate(req('GET', '/chats'));
    const b = await gate(req('GET', '/chats'));
    expect(forwardedRequestHeader(a, 'x-nonce')).not.toBe(forwardedRequestHeader(b, 'x-nonce'));
  });

  it('gives the rewritten welcome page a nonce too', async () => {
    const r = await gate(req('GET', '/', { cookie: false }));
    expect(forwardedRequestHeader(r, 'x-nonce')).toBe('nonce1');
  });

  it("adds 'unsafe-eval' only in development", async () => {
    expect((await gate(req('GET', '/chats'))).headers.get('content-security-policy')).not.toContain(
      'unsafe-eval',
    );
    const dev = build(true);
    expect((await dev(req('GET', '/chats'))).headers.get('content-security-policy')).toContain(
      "'unsafe-eval'",
    );
  });
});
