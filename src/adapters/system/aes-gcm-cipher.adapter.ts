import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { err, ok } from '@/core/domain';
import type { Result } from '@/core/domain';
import type { SecretCipher } from '@/core/ports';
import { decodeSecretKey } from './secret-key';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/**
 * Format version. It is also the additional authenticated data, so the prefix cannot be
 * swapped without failing authentication. A new algorithm or layout gets a new version.
 */
const VERSION = 'v1';
const PREFIX = `${VERSION}.`;
const BODY = /^[A-Za-z0-9_-]+$/;
const AAD = Buffer.from(VERSION, 'utf8');
const utf8 = new TextDecoder('utf-8', { fatal: true });

export interface AesGcmCipherOptions {
  /** CREDENTIALS_ENCRYPTION_KEY: base64 of 32 bytes. Every new ciphertext uses this key. */
  key: string;
  /**
   * Earlier keys, still accepted by `decrypt` while stored secrets are re-encrypted after a
   * key rotation. Same format as `key`.
   */
  previousKeys?: readonly string[];
}

/**
 * AES-256-GCM with a random 96-bit IV per call.
 * Ciphertext: `v1.` + base64url(iv[12] ‖ ciphertext ‖ tag[16]), with `v1` as AAD.
 */
export const createAesGcmCipher = (options: AesGcmCipherOptions): SecretCipher => {
  const key = decodeSecretKey(options.key, 'Cipher key');
  const decryptKeys = [
    key,
    ...(options.previousKeys ?? []).map((k) => decodeSecretKey(k, 'Previous cipher key')),
  ];

  const fail = (): Result<never, 'secret.decrypt_failed'> => err('secret.decrypt_failed');

  const open = (keyBytes: Buffer, iv: Buffer, data: Buffer, tag: Buffer): string | null => {
    try {
      const decipher = createDecipheriv(ALGORITHM, keyBytes, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(AAD);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]);
      return utf8.decode(plain);
    } catch {
      // Wrong key, changed data or invalid UTF-8: the caller only learns that it failed.
      return null;
    }
  };

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(AAD);
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${PREFIX}${Buffer.concat([iv, data, tag]).toString('base64url')}`;
    },

    decrypt(ciphertext: string): Result<string, 'secret.decrypt_failed'> {
      if (typeof ciphertext !== 'string' || !ciphertext.startsWith(PREFIX)) return fail();
      const body = ciphertext.slice(PREFIX.length);
      if (!BODY.test(body)) return fail();
      const bytes = Buffer.from(body, 'base64url');
      // Reject non-canonical encodings so no two strings decode to the same bytes.
      if (bytes.toString('base64url') !== body || bytes.length < IV_BYTES + TAG_BYTES) {
        return fail();
      }
      const iv = bytes.subarray(0, IV_BYTES);
      const data = bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES);
      const tag = bytes.subarray(bytes.length - TAG_BYTES);
      for (const keyBytes of decryptKeys) {
        const plaintext = open(keyBytes, iv, data, tag);
        if (plaintext !== null) return ok(plaintext);
      }
      return fail();
    },
  };
};
