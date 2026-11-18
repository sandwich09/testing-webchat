export type AccessCodeCheck = { ok: true; code: string } | { ok: false; reason: 'empty' };

/**
 * Checks the typed access code in the browser. Blank means no request is sent. The value that is
 * sent is the typed one, not trimmed: the server trims it (unlockBodySchema).
 */
export function validateAccessCode(value: string): AccessCodeCheck {
  if (value.trim() === '') return { ok: false, reason: 'empty' };
  return { ok: true, code: value };
}
