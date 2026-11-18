import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { describeContentHasherSuite } from '@/adapters/fakes';
import { createSha256ContentHasher } from './sha256-content-hasher.adapter';

const newSecret = (): string => randomBytes(32).toString('base64');

describeContentHasherSuite(() => {
  const sessionSecret = newSecret();
  return {
    hasher: createSha256ContentHasher({ sessionSecret }),
    sessionSecret,
    otherSecretHasher: createSha256ContentHasher({ sessionSecret: newSecret() }),
  };
});

describe('createSha256ContentHasher', () => {
  it('never returns the input inside a keyed hash', () => {
    const hasher = createSha256ContentHasher({ sessionSecret: newSecret() });
    expect(hasher.keyedHash('203.0.113.7')).not.toContain('203.0.113.7');
  });

  it('refuses a secret that is not base64 of 32 bytes', () => {
    expect(() => createSha256ContentHasher({ sessionSecret: '' })).toThrow(/Session secret/);
    expect(() => createSha256ContentHasher({ sessionSecret: 'too-short' })).toThrow(
      /Session secret/,
    );
  });
});
