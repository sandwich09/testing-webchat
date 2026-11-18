// Values from docs/architecture/project-setup.md section 10.4 and the Claude adapter section of
// docs/architecture/domain-and-ports.md.

/** SDK `timeout` (milliseconds) of a chat reply. */
export const CLAUDE_REPLY_TIMEOUT_MS = 45_000;
/** SDK `maxRetries` of a chat reply. */
export const CLAUDE_REPLY_MAX_RETRIES = 1;
/** SDK `timeout` (milliseconds) of a PDF conversion. */
export const CLAUDE_EXTRACT_TIMEOUT_MS = 240_000;
/** SDK `maxRetries` of a PDF conversion. */
export const CLAUDE_EXTRACT_MAX_RETRIES = 1;
/** SDK `maxRetries` of a topic guard check. Its timeout comes in the request (GUARD_TIMEOUT_MS). */
export const CLAUDE_GUARD_MAX_RETRIES = 1;

/**
 * Used when the factory gets no base URL. Passed explicitly so the SDK never falls back to
 * reading ANTHROPIC_BASE_URL itself: the composition root owns the environment.
 */
export const CLAUDE_DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Beta header of the server-side refusal fallback, sent with `fallbacks: "default"`. */
export const CLAUDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
