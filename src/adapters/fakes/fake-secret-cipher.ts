import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Result } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { SecretCipher } from '@/core/ports';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM with a random nonce per call, like the real adapter. The key is derived from a
 * string so tests can build two ciphers with different keys.
 */
export class FakeSecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(keyMaterial = 'fake-secret-cipher-key') {
    this.key = createHash('sha256').update(keyMaterial, 'utf8').digest();
  }

  encrypt(plaintext: string): string {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString('base64url');
  }

  decrypt(ciphertext: string): Result<string, 'secret.decrypt_failed'> {
    const raw = Buffer.from(ciphertext, 'base64url');
    if (raw.length < NONCE_BYTES + TAG_BYTES || raw.toString('base64url') !== ciphertext) {
      return err('secret.decrypt_failed');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, NONCE_BYTES));
      decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
      const body = raw.subarray(NONCE_BYTES, raw.length - TAG_BYTES);
      return ok(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
    } catch {
      return err('secret.decrypt_failed');
    }
  }
}
