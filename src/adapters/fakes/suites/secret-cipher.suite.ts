import { describe, expect, it } from 'vitest';
import type { SecretCipher } from '@/core/ports';

export interface SecretCipherHarness {
  cipher: SecretCipher;
  /** A cipher of the same kind built with a different key. */
  otherKeyCipher: SecretCipher;
}

/** Runs every row of the SecretCipher contract in domain-and-ports against the subject. */
export const describeSecretCipherSuite = (
  makeHarness: () => SecretCipherHarness | Promise<SecretCipherHarness>,
): void => {
  describe('SecretCipher', () => {
    it.each(['channel-secret-abc', '', 'ภาษาไทย 🙂 with ünïcödé', 'x'.repeat(5000)])(
      'decrypts what it encrypted (%#)',
      async (plaintext) => {
        const { cipher } = await makeHarness();
        expect(cipher.decrypt(cipher.encrypt(plaintext))).toEqual({ ok: true, value: plaintext });
      },
    );

    it('uses a fresh nonce each time, so the same plaintext never gives the same ciphertext', async () => {
      const { cipher } = await makeHarness();
      const a = cipher.encrypt('same');
      const b = cipher.encrypt('same');
      expect(a).not.toBe(b);
      expect(cipher.decrypt(a)).toEqual({ ok: true, value: 'same' });
      expect(cipher.decrypt(b)).toEqual({ ok: true, value: 'same' });
    });

    it('does not show the plaintext in the ciphertext', async () => {
      const { cipher } = await makeHarness();
      const encrypted = cipher.encrypt('super-secret-token');
      expect(encrypted).not.toContain('super-secret-token');
      expect(encrypted).not.toContain(Buffer.from('super-secret-token').toString('base64'));
    });

    it('returns secret.decrypt_failed when the key differs', async () => {
      const { cipher, otherKeyCipher } = await makeHarness();
      const result = otherKeyCipher.decrypt(cipher.encrypt('secret'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('secret.decrypt_failed');
    });

    it('returns secret.decrypt_failed when the data was changed', async () => {
      const { cipher } = await makeHarness();
      const encrypted = cipher.encrypt('secret');
      const middle = Math.floor(encrypted.length / 2);
      const flipped = encrypted[middle] === 'A' ? 'B' : 'A';
      const tampered = `${encrypted.slice(0, middle)}${flipped}${encrypted.slice(middle + 1)}`;
      for (const bad of [tampered, encrypted.slice(0, -4), `${encrypted}AAAA`]) {
        const result = cipher.decrypt(bad);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('secret.decrypt_failed');
      }
    });

    it.each(['', 'not a ciphertext', '!!!', 'AAAA'])(
      'returns secret.decrypt_failed instead of throwing for %j',
      async (garbage) => {
        const { cipher } = await makeHarness();
        const result = cipher.decrypt(garbage);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('secret.decrypt_failed');
      },
    );
  });
};
