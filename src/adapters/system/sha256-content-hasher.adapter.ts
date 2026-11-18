import { createHash, createHmac } from 'node:crypto';
import type { ContentHasher } from '@/core/ports';
import { decodeSecretKey } from './secret-key';

export interface Sha256ContentHasherOptions {
  /** SESSION_SECRET: base64 of 32 bytes. Used as the HMAC key exactly as given (its text). */
  sessionSecret: string;
}

export const createSha256ContentHasher = (options: Sha256ContentHasherOptions): ContentHasher => {
  // Validated like the other secrets so a short or empty secret fails at start-up.
  decodeSecretKey(options.sessionSecret, 'Session secret');
  const secret = options.sessionSecret;

  return {
    sha256(bytes: Uint8Array): string {
      return createHash('sha256').update(bytes).digest('hex');
    },

    keyedHash(value: string): string {
      return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
    },
  };
};
