import type { ERROR_CODES } from './error-codes';

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError<C extends ErrorCode = ErrorCode> {
  code: C;
  /** For developers. Never holds message text, customer names, tokens or secrets. */
  detail?: string;
  /** Set only on `.rate_limited` codes; routes turn it into the Retry-After header. */
  retryAfterSeconds?: number;
}

export type Result<T, C extends ErrorCode = ErrorCode> =
  { ok: true; value: T } | { ok: false; error: AppError<C> };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <C extends ErrorCode>(
  code: C,
  detail?: string,
  retryAfterSeconds?: number,
): Result<never, C> => ({ ok: false, error: { code, detail, retryAfterSeconds } });
