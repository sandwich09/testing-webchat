import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ContentHasher } from '@/core/ports';

export interface ContentHasherHarness {
  hasher: ContentHasher;
  /** The SESSION_SECRET the subject was built with. */
  sessionSecret: string;
  /** A hasher of the same kind built with a different secret. */
  otherSecretHasher: ContentHasher;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Runs every row of the ContentHasher contract in domain-and-ports against the subject. */
export const describeContentHasherSuite = (
  makeHarness: () => ContentHasherHarness | Promise<ContentHasherHarness>,
): void => {
  describe('ContentHasher.sha256', () => {
    it.each([
      ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ])('returns the lowercase hex SHA-256 of %j', async (input, expected) => {
      const { hasher } = await makeHarness();
      expect(hasher.sha256(utf8(input))).toBe(expected);
    });

    it('hashes raw bytes, not text', async () => {
      const { hasher } = await makeHarness();
      const digest = hasher.sha256(Uint8Array.from([0, 255, 128, 10, 13]));
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
      expect(digest).not.toBe(hasher.sha256(Uint8Array.from([0, 255, 128, 10])));
    });
  });

  describe('ContentHasher.keyedHash', () => {
    it('is the base64url HMAC-SHA256 of the value under SESSION_SECRET', async () => {
      const { hasher, sessionSecret } = await makeHarness();
      const expected = createHmac('sha256', sessionSecret)
        .update('203.0.113.7', 'utf8')
        .digest('base64url');
      expect(hasher.keyedHash('203.0.113.7')).toBe(expected);
      expect(expected).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('is stable for one value and differs between values', async () => {
      const { hasher } = await makeHarness();
      expect(hasher.keyedHash('a')).toBe(hasher.keyedHash('a'));
      expect(hasher.keyedHash('a')).not.toBe(hasher.keyedHash('b'));
    });

    it('depends on the secret', async () => {
      const { hasher, otherSecretHasher } = await makeHarness();
      expect(hasher.keyedHash('a')).not.toBe(otherSecretHasher.keyedHash('a'));
    });

    it('hashes the empty string without throwing', async () => {
      const { hasher } = await makeHarness();
      expect(hasher.keyedHash('')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
  });
};
