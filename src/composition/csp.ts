import { randomBytes } from 'node:crypto';

const NONCE_BYTES = 16;

/** A fresh CSP nonce per request: 128 bits from the CSPRNG, base64. */
export const createNonce = (): string => randomBytes(NONCE_BYTES).toString('base64');

/**
 * Content-Security-Policy of docs/architecture/project-setup.md section 6.2, exactly.
 *
 * - `'unsafe-eval'` only under `next dev`, where React needs eval for its debugging tools.
 * - The HEIC converter (`heic-to/csp`, ADR 0019) has no WebAssembly and no eval, so neither
 *   `'wasm-unsafe-eval'` nor `'unsafe-eval'` is needed. It runs its decoder in a Worker made from
 *   a `blob:` URL; Chrome allows that through `script-src` with `'strict-dynamic'` (checked by
 *   converting a HEIC file under this policy). Firefox is not checked yet: if it blocks the
 *   worker, the fix is `worker-src blob:`.
 */
export const buildContentSecurityPolicy = (
  nonce: string,
  options: { development: boolean },
): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://profile.line-scdn.net https://stickershop.line-scdn.net https://*.public.blob.vercel-storage.com",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
