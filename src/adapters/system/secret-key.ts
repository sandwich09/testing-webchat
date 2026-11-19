/** Length in bytes of every key this folder accepts: AES-256 keys and the session secret. */
export const SECRET_KEY_BYTES = 32;

const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const canonical = (value: string): string =>
  value.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/**
 * Decodes a base64 (or base64url) secret and checks that it is exactly 32 bytes. Throws at
 * construction time with a message that names the setting but never shows its value.
 */
export const decodeSecretKey = (value: string, name: string): Buffer => {
  const invalid = new Error(
    `${name} must be base64 that decodes to exactly ${String(SECRET_KEY_BYTES)} bytes`,
  );
  if (typeof value !== 'string' || !BASE64.test(value)) throw invalid;
  const bytes = Buffer.from(value, 'base64');
  // Buffer.from ignores stray characters and trailing bits; re-encoding rejects such input.
  if (bytes.length !== SECRET_KEY_BYTES || bytes.toString('base64url') !== canonical(value)) {
    throw invalid;
  }
  return bytes;
};
