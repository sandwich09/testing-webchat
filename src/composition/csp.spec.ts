import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createNonce } from './csp';

describe('buildContentSecurityPolicy', () => {
  it('is exactly the policy of project-setup 6.2', () => {
    expect(buildContentSecurityPolicy('abc', { development: false })).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://profile.line-scdn.net https://stickershop.line-scdn.net https://*.public.blob.vercel-storage.com",
        "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
        "font-src 'self'",
        "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; '),
    );
  });

  it("adds 'unsafe-eval' to script-src in development only", () => {
    const dev = buildContentSecurityPolicy('abc', { development: true });
    expect(dev).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval';");
    expect(buildContentSecurityPolicy('abc', { development: false })).not.toContain('eval');
  });

  it('never allows wasm or inline scripts', () => {
    const csp = buildContentSecurityPolicy('n', { development: true });
    expect(csp).not.toContain('wasm-unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe('createNonce', () => {
  it('is 128 random bits in base64, different each time', () => {
    const a = createNonce();
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});
