// Values from docs/architecture/project-setup.md section 10.4.

/** Every LINE call except the profile and content downloads. */
export const LINE_REQUEST_TIMEOUT_MS = 5000;
/** `getProfile` runs before the webhook is answered, so it is short and never retried. */
export const LINE_PROFILE_TIMEOUT_MS = 3000;
/** Inbound media download, covering the whole body. */
export const LINE_CONTENT_TIMEOUT_MS = 30_000;
/** Automatic retries for network failures, 5xx and 429 only. */
export const LINE_MAX_RETRIES = 2;
/** `showLoading` is not retried: a failure there is only logged. */
export const LINE_LOADING_MAX_RETRIES = 0;

/** Wait before retry n (1-based) is `LINE_RETRY_BASE_DELAY_MS * 2^(n-1)` without Retry-After. */
export const LINE_RETRY_BASE_DELAY_MS = 250;
/** A Retry-After longer than this is not waited for; the call fails with `retryAfterSeconds`. */
export const LINE_RETRY_AFTER_MAX_MS = 5000;
