import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { describeAccessTokenSignerSuite } from '@/adapters/fakes';
import { ACCESS_COOKIE_TTL_MS } from '@/core/domain';
import { createHmacAccessTokenSigner } from './hmac-access-token-signer.adapter';

const CODE = 'test-access-code';
const newSecret = (): string => randomBytes(32).toString('base64');
const NOW = new Date('2026-11-18T03:00:00Z');

describeAccessTokenSignerSuite(() => {
  const sessionSecret = newSecret();
  return {
    signer: createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret }),
    code: CODE,
    otherSecretSigner: createHmacAccessTokenSigner({
      accessCode: CODE,
      sessionSecret: newSecret(),
    }),
    otherCodeSigner: createHmacAccessTokenSigner({ accessCode: 'new-access-code', sessionSecret }),
    sameSettingsSigner: createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret }),
  };
});

describe('createHmacAccessTokenSigner', () => {
  it('issues v1.<expiry ms>.<43-char signature> that expires ACCESS_COOKIE_TTL_MS later', () => {
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret: newSecret() });
    const { token, expiresAt } = signer.issue(NOW);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + ACCESS_COOKIE_TTL_MS);
    expect(token).toMatch(new RegExp(`^v1\\.${String(expiresAt.getTime())}\\.[A-Za-z0-9_-]{43}$`));
    expect(token).not.toContain(CODE);
  });

  it('rejects at the exact expiry instant and accepts the millisecond before', () => {
    const signer = createHmacAccessTokenSigner({
      accessCode: CODE,
      sessionSecret: newSecret(),
      ttlMs: 1000,
    });
    const { token, expiresAt } = signer.issue(NOW);
    expect(signer.verify(token, new Date(expiresAt.getTime() - 1))).toBe(true);
    expect(signer.verify(token, expiresAt)).toBe(false);
  });

  it('rejects a token whose expiry was moved, even by one millisecond', () => {
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret: newSecret() });
    const { token, expiresAt } = signer.issue(NOW);
    const signature = token.split('.')[2] ?? '';
    const later = `v1.${String(expiresAt.getTime() + 1)}.${signature}`;
    expect(signer.verify(later, NOW)).toBe(false);
    expect(signer.verify(`v2.${token.slice(3)}`, NOW)).toBe(false);
  });

  it('does not sign with the raw SESSION_SECRET, so a keyedHash value is never a valid signature', () => {
    const sessionSecret = newSecret();
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret });
    const payload = `v1.${String(NOW.getTime() + 60_000)}`;
    const rawSignature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
    expect(signer.verify(`${payload}.${rawSignature}`, NOW)).toBe(false);
  });

  it('signs out everyone when ACCESS_CODE changes: a token from code A fails once the code is B', () => {
    const sessionSecret = newSecret();
    const before = createHmacAccessTokenSigner({ accessCode: 'code-a', sessionSecret });
    const { token } = before.issue(NOW);
    const restartedSameCode = createHmacAccessTokenSigner({ accessCode: 'code-a', sessionSecret });
    const afterChange = createHmacAccessTokenSigner({ accessCode: 'code-b', sessionSecret });
    expect(restartedSameCode.verify(token, NOW)).toBe(true);
    expect(afterChange.verify(token, NOW)).toBe(false);
    expect(afterChange.checkCode('code-a')).toBe(false);
  });

  it('keys the signature on both SESSION_SECRET and a digest of ACCESS_CODE, never the code alone', () => {
    const sessionSecret = newSecret();
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret });
    const payload = `v1.${String(NOW.getTime() + 60_000)}`;
    const withSecretOnlyKey = createHmac(
      'sha256',
      Buffer.from(
        hkdfSync(
          'sha256',
          Buffer.from(sessionSecret, 'base64'),
          'twa.access-token',
          'hmac-sha256.v1',
          32,
        ),
      ),
    )
      .update(payload)
      .digest('base64url');
    const withCodeAsKey = createHmac('sha256', CODE).update(payload).digest('base64url');
    expect(signer.verify(`${payload}.${withSecretOnlyKey}`, NOW)).toBe(false);
    expect(signer.verify(`${payload}.${withCodeAsKey}`, NOW)).toBe(false);
  });

  it('rejects a signature that differs only in the spare bits of its last character', () => {
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret: newSecret() });
    const { token } = signer.issue(NOW);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const spare = alphabet[alphabet.indexOf(token.at(-1) ?? 'A') ^ 0x01] ?? 'A';
    const changed = `${token.slice(0, -1)}${spare}`;
    expect(Buffer.from(changed.split('.')[2] ?? '', 'base64url')).toEqual(
      Buffer.from(token.split('.')[2] ?? '', 'base64url'),
    );
    expect(signer.verify(changed, NOW)).toBe(false);
  });

  it('returns false for a non-string token, an overlong token and an invalid date', () => {
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret: newSecret() });
    const { token } = signer.issue(NOW);
    // Casts let other types through at runtime.
    expect(signer.verify(undefined as unknown as string, NOW)).toBe(false);
    expect(signer.verify(`${token}${'A'.repeat(100)}`, NOW)).toBe(false);
    expect(signer.verify(`v1.${'9'.repeat(17)}.${'A'.repeat(43)}`, NOW)).toBe(false);
    expect(signer.verify(token, new Date(Number.NaN))).toBe(false);
    expect(signer.checkCode(null as unknown as string)).toBe(false);
  });

  it('compares codes of any length, including non-ASCII, without throwing', () => {
    const signer = createHmacAccessTokenSigner({ accessCode: 'รหัสลับ', sessionSecret: newSecret() });
    expect(signer.checkCode('รหัสลับ')).toBe(true);
    expect(signer.checkCode('รหัส')).toBe(false);
    expect(signer.checkCode('x'.repeat(10_000))).toBe(false);
  });

  it('throws on an invalid issue date, since that is a bug in the caller', () => {
    const signer = createHmacAccessTokenSigner({ accessCode: CODE, sessionSecret: newSecret() });
    expect(() => signer.issue(new Date(Number.NaN))).toThrow(/valid Date/);
  });

  it.each([
    ['an empty access code', { accessCode: '', sessionSecret: newSecret() }, /Access code/],
    ['a short secret', { accessCode: CODE, sessionSecret: 'c2hvcnQ=' }, /Session secret/],
    ['a zero TTL', { accessCode: CODE, sessionSecret: newSecret(), ttlMs: 0 }, /TTL/],
    ['a fractional TTL', { accessCode: CODE, sessionSecret: newSecret(), ttlMs: 1.5 }, /TTL/],
  ])('refuses %s', (_name, options, message) => {
    expect(() => createHmacAccessTokenSigner(options)).toThrow(message);
  });
});
