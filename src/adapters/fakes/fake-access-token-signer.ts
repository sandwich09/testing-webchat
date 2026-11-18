import { createHmac, timingSafeEqual } from 'node:crypto';
import { ACCESS_COOKIE_TTL_MS } from '@/core/domain';
import type { AccessTokenSigner } from '@/core/ports';

export const FAKE_ACCESS_CODE = 'fake-access-code';

const safeEqual = (a: string, b: string): boolean => {
  const left = createHmac('sha256', 'compare').update(a, 'utf8').digest();
  const right = createHmac('sha256', 'compare').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
};

/** HMAC token `<expiry ms>.<signature>`; the expiry is inside, so `verify` needs no storage. */
export class FakeAccessTokenSigner implements AccessTokenSigner {
  private readonly code: string;
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(opts: { code?: string; secret?: string; ttlMs?: number } = {}) {
    this.code = opts.code ?? FAKE_ACCESS_CODE;
    this.secret = opts.secret ?? 'fake-session-secret';
    this.ttlMs = opts.ttlMs ?? ACCESS_COOKIE_TTL_MS;
  }

  checkCode(code: string): boolean {
    return safeEqual(code, this.code);
  }

  issue(now: Date): { token: string; expiresAt: Date } {
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const expiry = String(expiresAt.getTime());
    return { token: `${expiry}.${this.sign(expiry)}`, expiresAt };
  }

  verify(token: string, now: Date): boolean {
    const match = /^(\d{1,16})\.([A-Za-z0-9_-]+)$/.exec(token);
    if (match === null) return false;
    const [, expiry = '', signature = ''] = match;
    if (!safeEqual(signature, this.sign(expiry))) return false;
    return now.getTime() < Number(expiry);
  }

  private sign(expiry: string): string {
    return createHmac('sha256', this.secret).update(`access:${expiry}`, 'utf8').digest('base64url');
  }
}
