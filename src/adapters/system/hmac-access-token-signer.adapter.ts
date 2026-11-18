import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCESS_COOKIE_TTL_MS } from '@/core/domain';
import type { AccessTokenSigner } from '@/core/ports';
import { decodeSecretKey } from './secret-key';

const VERSION = 'v1';
/** `v1.<expiry ms>.<base64url HMAC-SHA256 of "v1.<expiry ms>">`. Nothing else is inside. */
const TOKEN = /^v1\.(0|[1-9][0-9]{0,15})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_LENGTH = 64;
/**
 * The token key is derived with HKDF rather than used directly, so it never equals an HMAC
 * that ContentHasher.keyedHash could produce from the same SESSION_SECRET.
 */
const HKDF_SALT = 'twa.access-token';
const HKDF_INFO = `hmac-sha256.${VERSION}`;

export interface HmacAccessTokenSignerOptions {
  /** ACCESS_CODE. */
  accessCode: string;
  /** SESSION_SECRET: base64 of 32 bytes. */
  sessionSecret: string;
  /** Token lifetime. Defaults to ACCESS_COOKIE_TTL_MS. */
  ttlMs?: number;
}

const isValidDate = (value: Date): boolean =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const createHmacAccessTokenSigner = (
  options: HmacAccessTokenSignerOptions,
): AccessTokenSigner => {
  if (typeof options.accessCode !== 'string' || options.accessCode.length === 0) {
    throw new Error('Access code must be a non-empty string');
  }
  const ttlMs = options.ttlMs ?? ACCESS_COOKIE_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new Error('Access token TTL must be a positive integer of milliseconds');
  }
  const secret = decodeSecretKey(options.sessionSecret, 'Session secret');
  const tokenKey = Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, 32));

  // Codes are compared as HMAC digests under a per-process random key: both sides are always
  // 32 bytes, so neither the comparison time nor an early length check reveals the code length.
  const codeKey = randomBytes(32);
  const digestCode = (code: string): Buffer =>
    createHmac('sha256', codeKey).update(code, 'utf8').digest();
  const expectedCode = digestCode(options.accessCode);

  const sign = (payload: string): string =>
    createHmac('sha256', tokenKey).update(payload, 'utf8').digest('base64url');

  return {
    checkCode(code: string): boolean {
      if (typeof code !== 'string') return false;
      return timingSafeEqual(digestCode(code), expectedCode);
    },

    issue(now: Date): { token: string; expiresAt: Date } {
      if (!isValidDate(now)) throw new Error('issue() needs a valid Date');
      const expiresAt = new Date(now.getTime() + ttlMs);
      const payload = `${VERSION}.${String(expiresAt.getTime())}`;
      return { token: `${payload}.${sign(payload)}`, expiresAt };
    },

    verify(token: string, now: Date): boolean {
      if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || !isValidDate(now)) {
        return false;
      }
      const match = TOKEN.exec(token);
      if (match === null) return false;
      const [, expiry = '', signature = ''] = match;
      // Compare the text, not decoded bytes: the last base64url character has spare bits, so
      // two different strings can decode to the same digest. Both sides are 43 ASCII bytes.
      const expected = sign(`${VERSION}.${expiry}`);
      if (!timingSafeEqual(Buffer.from(signature, 'ascii'), Buffer.from(expected, 'ascii'))) {
        return false;
      }
      const expiresAtMs = Number(expiry);
      return Number.isSafeInteger(expiresAtMs) && now.getTime() < expiresAtMs;
    },
  };
};
