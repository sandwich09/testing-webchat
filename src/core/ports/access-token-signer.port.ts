export interface AccessTokenSigner {
  /** Sync: compares with ACCESS_CODE in constant time. */
  checkCode(code: string): boolean;
  /** Sync: an HMAC token with its expiry inside. */
  issue(now: Date): { token: string; expiresAt: Date };
  /** Sync: false when the signature is wrong, the shape is wrong, or the token has expired. */
  verify(token: string, now: Date): boolean;
}
