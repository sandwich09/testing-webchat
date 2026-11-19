import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { describeSecretCipherSuite } from '@/adapters/fakes';
import { createAesGcmCipher } from './aes-gcm-cipher.adapter';

const newKey = (): string => randomBytes(32).toString('base64');

describeSecretCipherSuite(() => ({
  cipher: createAesGcmCipher({ key: newKey() }),
  otherKeyCipher: createAesGcmCipher({ key: newKey() }),
}));

const expectFailed = (result: { ok: boolean; error?: { code: string; detail?: string } }) => {
  expect(result).toEqual({ ok: false, error: { code: 'secret.decrypt_failed' } });
};

/** Flips one bit of one byte inside the base64url body and re-encodes it canonically. */
const tamperByte = (ciphertext: string, index: number): string => {
  const bytes = Buffer.from(ciphertext.slice(3), 'base64url');
  bytes[index] = (bytes[index] ?? 0) ^ 0x01;
  return `v1.${bytes.toString('base64url')}`;
};

describe('createAesGcmCipher', () => {
  it('writes v1. followed by base64url of a 12-byte IV, the ciphertext and a 16-byte tag', () => {
    const cipher = createAesGcmCipher({ key: newKey() });
    const encrypted = cipher.encrypt('abc');
    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(Buffer.from(encrypted.slice(3), 'base64url')).toHaveLength(12 + 3 + 16);
  });

  it('uses a different IV every time', () => {
    const cipher = createAesGcmCipher({ key: newKey() });
    const ivs = new Set(
      Array.from({ length: 200 }, () =>
        Buffer.from(cipher.encrypt('x').slice(3), 'base64url').subarray(0, 12).toString('hex'),
      ),
    );
    expect(ivs.size).toBe(200);
  });

  it('returns secret.decrypt_failed with no detail when any single byte was changed', () => {
    const cipher = createAesGcmCipher({ key: newKey() });
    const encrypted = cipher.encrypt('channel-secret');
    const length = Buffer.from(encrypted.slice(3), 'base64url').length;
    for (let i = 0; i < length; i += 1) expectFailed(cipher.decrypt(tamperByte(encrypted, i)));
  });

  it('rejects a changed version prefix and a non-canonical encoding', () => {
    const cipher = createAesGcmCipher({ key: newKey() });
    const encrypted = cipher.encrypt('x');
    expectFailed(cipher.decrypt(`v2.${encrypted.slice(3)}`));
    expectFailed(cipher.decrypt(encrypted.slice(3)));
    expectFailed(cipher.decrypt(`${encrypted}=`));
    expectFailed(
      cipher.decrypt(`v1.${Buffer.from(encrypted.slice(3), 'base64url').toString('base64')}+/`),
    );
    // The last base64url character carries spare bits; changing them must not be accepted.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const spare = alphabet[alphabet.indexOf(encrypted.at(-1) ?? 'A') ^ 0x01] ?? 'A';
    expect(Buffer.from(`${encrypted.slice(3, -1)}${spare}`, 'base64url')).toEqual(
      Buffer.from(encrypted.slice(3), 'base64url'),
    );
    expectFailed(cipher.decrypt(`${encrypted.slice(0, -1)}${spare}`));
  });

  it('returns secret.decrypt_failed instead of throwing for input that is too short or not a string', () => {
    const cipher = createAesGcmCipher({ key: newKey() });
    expectFailed(cipher.decrypt('v1.'));
    expectFailed(cipher.decrypt(`v1.${Buffer.alloc(27).toString('base64url')}`));
    // A cast lets a non-string through at runtime.
    expectFailed(cipher.decrypt(42 as unknown as string));
  });

  it('decrypts with a previous key after rotation and encrypts with the new key only', () => {
    const oldKey = newKey();
    const before = createAesGcmCipher({ key: oldKey }).encrypt('old-secret');
    const rotated = createAesGcmCipher({ key: newKey(), previousKeys: [oldKey] });
    expect(rotated.decrypt(before)).toEqual({ ok: true, value: 'old-secret' });
    expectFailed(createAesGcmCipher({ key: oldKey }).decrypt(rotated.encrypt('new-secret')));
  });

  it.each([
    ['empty', ''],
    ['31 bytes', randomBytes(31).toString('base64')],
    ['33 bytes', randomBytes(33).toString('base64')],
    ['not base64', '!'.repeat(44)],
    ['32 raw characters', 'x'.repeat(32)],
  ])('refuses a key that is %s without showing it', (_name, key) => {
    let message = '';
    try {
      createAesGcmCipher({ key });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toMatch(/decodes to exactly 32 bytes/);
    if (key.length > 0) expect(message).not.toContain(key);
  });

  it('accepts the key in base64url form and checks previous keys too', () => {
    const key = randomBytes(32);
    const cipher = createAesGcmCipher({ key: key.toString('base64url') });
    const standard = createAesGcmCipher({ key: key.toString('base64') });
    expect(standard.decrypt(cipher.encrypt('same key'))).toEqual({ ok: true, value: 'same key' });
    expect(() => createAesGcmCipher({ key: newKey(), previousKeys: ['short'] })).toThrow(
      /Previous cipher key/,
    );
  });
});
