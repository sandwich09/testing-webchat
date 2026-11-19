import type { Result } from '@/core/domain';

export interface SecretCipher {
  /** AES-256-GCM with a random nonce per call. Returns one string holding nonce, ciphertext and tag. */
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): Result<string, 'secret.decrypt_failed'>;
}
