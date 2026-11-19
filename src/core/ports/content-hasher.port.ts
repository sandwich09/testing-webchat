export interface ContentHasher {
  /** Sync: lowercase hex. */
  sha256(bytes: Uint8Array): string;
  /** Sync: HMAC-SHA256 with SESSION_SECRET, base64url. Applied to an IP before it becomes a rate limit key. */
  keyedHash(value: string): string;
}
