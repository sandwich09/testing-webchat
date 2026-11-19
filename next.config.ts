import type { NextConfig } from 'next';
// Relative on purpose: next.config.ts is loaded before the `@/` alias exists. constants.ts has
// no runtime imports.
import { PROXY_BODY_MAX_BYTES } from './src/core/domain/constants';

// Static security headers (docs/security/threat-model.md). Content-Security-Policy needs a
// per-request nonce, so it is set in proxy.ts instead.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Not `no-referrer`: browsers would then send `Origin: null` on POST and the origin check fails.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // proxy.ts makes Next.js buffer every non-GET body it sees, by default up to 10 MB, and a
    // longer body reaches the route cut short without an error. The local-disk upload PUT carries
    // a video up to VIDEO_MAX_BYTES, so the buffer must hold it (the PUT also rejects a body
    // shorter than the size its ticket was signed for).
    proxyClientMaxBodySize: PROXY_BODY_MAX_BYTES,
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
