import { describe, expect, it } from 'vitest';
import { FakeAccessTokenSigner } from './fake-access-token-signer';
import { describeAccessTokenSignerSuite } from './suites/access-token-signer.suite';

describeAccessTokenSignerSuite(() => ({
  signer: new FakeAccessTokenSigner({ code: 'open-sesame', secret: 'one' }),
  code: 'open-sesame',
  otherSecretSigner: new FakeAccessTokenSigner({ code: 'open-sesame', secret: 'two' }),
}));

describe('FakeAccessTokenSigner options', () => {
  it('uses the configured lifetime', () => {
    const signer = new FakeAccessTokenSigner({ ttlMs: 1000 });
    const now = new Date('2026-11-18T00:00:00Z');
    expect(signer.issue(now).expiresAt.getTime() - now.getTime()).toBe(1000);
  });
});
