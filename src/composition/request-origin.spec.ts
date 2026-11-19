import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseOriginHeader, requestOwnOrigin } from './request-origin';

const VERCEL = 'https://webchat-shop.vercel.app';
const SECOND = 'https://webchat-shop-git-main-team.vercel.app';
const CONFIGURED = 'https://chat.shop.example';

/**
 * A request as the standalone server hands it to proxy.ts and to route handlers: `request.url`
 * carries the bind address (HOSTNAME and PORT), not the host the browser used, and the scheme
 * follows `x-forwarded-proto`. Observed with `next start` (standalone) of Next.js 16.
 */
const request = (headers: Record<string, string>, url = 'http://0.0.0.0:3000/api/x') => ({
  url,
  headers: new Headers(headers),
});

/** What Vercel's proxy sends for a browser on `host` (assumed; see ADR 0025). */
const viaVercel = (host: string, origin: string | null) =>
  request(
    {
      host,
      'x-forwarded-host': host,
      'x-forwarded-proto': 'https',
      ...(origin === null ? {} : { origin }),
    },
    `https://${host}/api/x`,
  );

describe('isAllowedOrigin', () => {
  it('passes same-origin on the Vercel domain when APP_BASE_URL is another domain', () => {
    expect(isAllowedOrigin(viaVercel('webchat-shop.vercel.app', VERCEL), CONFIGURED)).toBe(true);
  });

  it('passes same-origin on a second domain of the same deployment', () => {
    const host = 'webchat-shop-git-main-team.vercel.app';
    expect(isAllowedOrigin(viaVercel(host, SECOND), VERCEL)).toBe(true);
  });

  it('passes the configured origin even when the request reached another host', () => {
    expect(isAllowedOrigin(viaVercel('webchat-shop.vercel.app', CONFIGURED), CONFIGURED)).toBe(
      true,
    );
  });

  it('passes same-origin in Docker, where request.url is the bind address', () => {
    const r = request({ host: 'localhost:3000', origin: 'http://localhost:3000' });
    expect(isAllowedOrigin(r, 'http://configured.example:3000')).toBe(true);
  });

  it('rejects a cross-site origin', () => {
    expect(
      isAllowedOrigin(viaVercel('webchat-shop.vercel.app', 'https://evil.example'), CONFIGURED),
    ).toBe(false);
  });

  it('rejects a sibling subdomain of the platform', () => {
    expect(
      isAllowedOrigin(viaVercel('webchat-shop.vercel.app', 'https://evil.vercel.app'), VERCEL),
    ).toBe(false);
  });

  it('rejects a missing Origin header, even on the configured host', () => {
    expect(isAllowedOrigin(viaVercel('chat.shop.example', null), CONFIGURED)).toBe(false);
  });

  it('rejects Origin: null', () => {
    expect(isAllowedOrigin(viaVercel('webchat-shop.vercel.app', 'null'), VERCEL)).toBe(false);
  });

  it('rejects http when the request came over https, and the reverse', () => {
    expect(
      isAllowedOrigin(
        viaVercel('webchat-shop.vercel.app', 'http://webchat-shop.vercel.app'),
        CONFIGURED,
      ),
    ).toBe(false);
    const plain = request({ host: 'localhost:3000', origin: 'https://localhost:3000' });
    expect(isAllowedOrigin(plain, 'http://configured.example')).toBe(false);
    expect(isAllowedOrigin(request({ origin: 'http://chat.shop.example' }), CONFIGURED)).toBe(
      false,
    );
  });

  it('rejects a different port, on the own host and on the configured one', () => {
    const r = request({ host: 'localhost:3000', origin: 'http://localhost:3001' });
    expect(isAllowedOrigin(r, 'http://localhost:3002')).toBe(false);
    expect(isAllowedOrigin(request({ origin: 'https://chat.shop.example:8443' }), CONFIGURED)).toBe(
      false,
    );
  });

  it('treats a mixed-case host as the same host', () => {
    expect(
      isAllowedOrigin(
        viaVercel('Webchat-Shop.Vercel.app', 'https://WEBCHAT-shop.vercel.app'),
        CONFIGURED,
      ),
    ).toBe(true);
    expect(isAllowedOrigin(request({ origin: 'https://Chat.Shop.Example' }), CONFIGURED)).toBe(
      true,
    );
  });

  it('keeps a trailing dot significant: it is another origin for the browser', () => {
    expect(isAllowedOrigin(request({ origin: `${CONFIGURED}.` }), CONFIGURED)).toBe(false);
    expect(isAllowedOrigin(viaVercel('webchat-shop.vercel.app', `${VERCEL}.`), CONFIGURED)).toBe(
      false,
    );
    expect(isAllowedOrigin(viaVercel('webchat-shop.vercel.app.', `${VERCEL}.`), CONFIGURED)).toBe(
      true,
    );
  });

  it('rejects an Origin with a path, credentials or an explicit default port', () => {
    for (const origin of [
      `${CONFIGURED}/`,
      `${CONFIGURED}/x`,
      'https://u@chat.shop.example',
      `${CONFIGURED}:443`,
    ]) {
      expect(isAllowedOrigin(request({ origin }), CONFIGURED)).toBe(false);
    }
  });

  it('never matches when the own origin cannot be told', () => {
    expect(isAllowedOrigin(request({ origin: 'http://localhost:3000' }), CONFIGURED)).toBe(false);
  });
});

describe('requestOwnOrigin', () => {
  it('prefers x-forwarded-host and x-forwarded-proto over Host and request.url', () => {
    const r = request({
      host: 'internal:3000',
      'x-forwarded-host': 'webchat-shop.vercel.app',
      'x-forwarded-proto': 'https',
    });
    expect(requestOwnOrigin(r)).toBe(VERCEL);
  });

  it('falls back to Host and the scheme of request.url', () => {
    expect(requestOwnOrigin(request({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
    expect(requestOwnOrigin(request({ host: 'localhost:3000' }, 'https://0.0.0.0:3000/x'))).toBe(
      'https://localhost:3000',
    );
  });

  it('takes the first value of a comma-separated forwarded header', () => {
    const r = request({
      'x-forwarded-host': 'webchat-shop.vercel.app, internal',
      'x-forwarded-proto': 'https,http',
    });
    expect(requestOwnOrigin(r)).toBe(VERCEL);
  });

  it('drops the default port of the scheme', () => {
    const r = request({ host: 'webchat-shop.vercel.app:443', 'x-forwarded-proto': 'https' });
    expect(requestOwnOrigin(r)).toBe(VERCEL);
  });

  it.each([
    ['no host header', {}],
    ['a host with a path', { host: 'evil.example/x' }],
    ['a host with credentials', { host: 'user@evil.example' }],
    ['a forwarded scheme that is not http(s)', { host: 'a.example', 'x-forwarded-proto': 'ftp' }],
  ])('is null for %s', (_label, headers: Record<string, string>) => {
    expect(requestOwnOrigin(request(headers))).toBeNull();
  });

  it('accepts a bracketed IPv6 literal', () => {
    expect(requestOwnOrigin(request({ host: '[::1]:3000' }))).toBe('http://[::1]:3000');
  });
});

describe('parseOriginHeader', () => {
  it.each([
    [null, null],
    ['null', null],
    ['', null],
    ['chat.shop.example', null],
    ['ftp://chat.shop.example', null],
    ['https://chat.shop.example/', null],
    ['https://chat.shop.example', 'https://chat.shop.example'],
    ['HTTPS://CHAT.shop.example', 'https://chat.shop.example'],
    ['http://localhost:3000', 'http://localhost:3000'],
  ])('%j gives %j', (value, expected) => {
    expect(parseOriginHeader(value)).toBe(expected);
  });
});
