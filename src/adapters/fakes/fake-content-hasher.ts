import { createHash, createHmac } from 'node:crypto';
import type { ContentHasher } from '@/core/ports';

export const FAKE_SESSION_SECRET = 'fake-session-secret';

/** Real SHA-256 and HMAC-SHA256, so hashes match what the production adapter produces. */
export class FakeContentHasher implements ContentHasher {
  private readonly secret: string;

  constructor(secret: string = FAKE_SESSION_SECRET) {
    this.secret = secret;
  }

  sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  keyedHash(value: string): string {
    return createHmac('sha256', this.secret).update(value, 'utf8').digest('base64url');
  }
}
