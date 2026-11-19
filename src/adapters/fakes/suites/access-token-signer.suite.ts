import { describe, expect, it } from 'vitest';
import type { AccessTokenSigner } from '@/core/ports';

export interface AccessTokenSignerHarness {
  signer: AccessTokenSigner;
  /** The ACCESS_CODE the subject was built with. */
  code: string;
  /** A signer of the same kind built with a different secret. */
  otherSecretSigner: AccessTokenSigner;
  /** A signer of the same kind built with the same secret and a different access code. */
  otherCodeSigner: AccessTokenSigner;
  /** A second signer built with the same secret and the same code as `signer`. */
  sameSettingsSigner: AccessTokenSigner;
}

const NOW = new Date('2026-11-18T03:00:00Z');

/** Runs every row of the AccessTokenSigner contract in domain-and-ports against the subject. */
export const describeAccessTokenSignerSuite = (
  makeHarness: () => AccessTokenSignerHarness | Promise<AccessTokenSignerHarness>,
): void => {
  describe('AccessTokenSigner.checkCode', () => {
    it('accepts the access code', async () => {
      const h = await makeHarness();
      expect(h.signer.checkCode(h.code)).toBe(true);
    });

    it('rejects a wrong code, an empty code, a prefix, an extension and a different case', async () => {
      const h = await makeHarness();
      for (const wrong of [
        '',
        'wrong',
        h.code.slice(0, -1),
        `${h.code}x`,
        ` ${h.code}`,
        h.code.toUpperCase() + '!',
      ]) {
        expect(h.signer.checkCode(wrong)).toBe(false);
      }
    });
  });

  describe('AccessTokenSigner.issue and verify', () => {
    it('issues a token that expires after the time it was issued and verifies before then', async () => {
      const { signer } = await makeHarness();
      const { token, expiresAt } = signer.issue(NOW);
      expect(token.length).toBeGreaterThan(0);
      expect(expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(signer.verify(token, NOW)).toBe(true);
      expect(signer.verify(token, new Date(expiresAt.getTime() - 1))).toBe(true);
    });

    it('rejects the token once it has expired', async () => {
      const { signer } = await makeHarness();
      const { token, expiresAt } = signer.issue(NOW);
      expect(signer.verify(token, new Date(expiresAt.getTime() + 1))).toBe(false);
      expect(signer.verify(token, new Date(expiresAt.getTime() + 86_400_000))).toBe(false);
    });

    it('rejects a token signed with another secret', async () => {
      const { signer, otherSecretSigner } = await makeHarness();
      const { token } = otherSecretSigner.issue(NOW);
      expect(signer.verify(token, NOW)).toBe(false);
    });

    it('rejects a token issued under another access code with the same secret', async () => {
      const { signer, otherCodeSigner } = await makeHarness();
      expect(signer.verify(otherCodeSigner.issue(NOW).token, NOW)).toBe(false);
      expect(otherCodeSigner.verify(signer.issue(NOW).token, NOW)).toBe(false);
    });

    it('accepts a token from another instance built with the same secret and code', async () => {
      const { signer, sameSettingsSigner } = await makeHarness();
      expect(sameSettingsSigner.verify(signer.issue(NOW).token, NOW)).toBe(true);
    });

    it('rejects a token that was changed', async () => {
      const { signer } = await makeHarness();
      const { token } = signer.issue(NOW);
      const flipped = token.endsWith('A') ? 'B' : 'A';
      expect(signer.verify(`${token.slice(0, -1)}${flipped}`, NOW)).toBe(false);
      expect(signer.verify(`x${token}`, NOW)).toBe(false);
      expect(signer.verify(token.slice(0, -2), NOW)).toBe(false);
    });

    it.each(['', 'garbage', '.', '..', 'a.b.c', '🙂', ' '])(
      'returns false without throwing for the malformed token %j',
      async (token) => {
        const { signer } = await makeHarness();
        expect(signer.verify(token, NOW)).toBe(false);
      },
    );
  });
};
