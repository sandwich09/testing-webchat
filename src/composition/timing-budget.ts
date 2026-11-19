import {
  CLAUDE_COUNT_TOKENS_TIMEOUT_MS,
  CLAUDE_EXTRACT_MAX_RETRIES,
  CLAUDE_EXTRACT_TIMEOUT_MS,
  CLAUDE_GUARD_MAX_RETRIES,
  CLAUDE_REPLY_MAX_RETRIES,
  CLAUDE_REPLY_TIMEOUT_MS,
  callDeadlineMs,
} from '@/adapters/claude';
import {
  LINE_CONTENT_IDLE_TIMEOUT_MS,
  LINE_CONTENT_TIMEOUT_MS,
  LINE_LOADING_MAX_RETRIES,
  LINE_MAX_RETRIES,
  LINE_PROFILE_TIMEOUT_MS,
  LINE_REQUEST_TIMEOUT_MS,
  LINE_RETRY_AFTER_MAX_MS,
} from '@/adapters/line';
import {
  AI_MAX_ROUNDS_PER_RUN,
  GUARD_TIMEOUT_MS,
  MEDIA_JOB_BUDGET_MS,
  STORAGE_CALL_TIMEOUT_MS,
  STORAGE_PUT_TIMEOUT_MS,
} from '@/core/domain';

// Worst-case durations of the work that runs after a response (docs/architecture/project-setup.md
// section 10.4, "เวลาแย่ที่สุด"). Every value is computed from the real constants, and
// timing-budget.spec.ts pins each inequality, so a change of a timeout, a retry count or a round
// that no longer fits a function's maxDuration fails the build.

/**
 * Share of a function's maxDuration that the worst case of its jobs may use. The rest is the
 * margin for what has no timeout of its own: database calls (a Neon cold start included), the
 * local disk storage and the work before the response (Vercel Blob calls have their own bounds).
 */
export const JOB_BUDGET_SHARE = 0.9;

/** One LINE call: every attempt at its timeout, and the longest Retry-After waited before each retry. */
export const lineCallWorstMs = (timeoutMs: number, retries: number): number =>
  timeoutMs * (1 + retries) + LINE_RETRY_AFTER_MAX_MS * retries;

/** Sending one AI message: a reply that ends with a rejected token after its retries, then a push. */
export const deliverWorstMs = (): number =>
  lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, LINE_MAX_RETRIES) * 2;

/** One round of GenerateAiReply with the topic guard on: loading, guard, chat model, delivery. */
export const aiRoundWorstMs = (): number =>
  lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, LINE_LOADING_MAX_RETRIES) +
  callDeadlineMs({ timeoutMs: GUARD_TIMEOUT_MS, maxRetries: CLAUDE_GUARD_MAX_RETRIES }) +
  callDeadlineMs({ timeoutMs: CLAUDE_REPLY_TIMEOUT_MS, maxRetries: CLAUDE_REPLY_MAX_RETRIES }) +
  deliverWorstMs();

/** A whole GenerateAiReply job: the first wait, every round, and the wait before each later round. */
export const aiRunWorstMs = (debounceMs: number): number =>
  debounceMs * AI_MAX_ROUNDS_PER_RUN + aiRoundWorstMs() * AI_MAX_ROUNDS_PER_RUN;

/** RefreshContactProfile: one profile fetch, no retry (the rest is database work). */
export const profileRefreshJobWorstMs = (): number => lineCallWorstMs(LINE_PROFILE_TIMEOUT_MS, 0);

/**
 * POST /api/line/webhook: one profile fetch before the response (a first-seen contact), then the
 * longest job. The jobs of one request run side by side, so the longest one counts.
 */
export const webhookWorstMs = (debounceMs: number): number =>
  lineCallWorstMs(LINE_PROFILE_TIMEOUT_MS, 0) +
  Math.max(aiRunWorstMs(debounceMs), mediaJobWorstMs(), profileRefreshJobWorstMs());

/**
 * One content download from LINE: every attempt at LINE_CONTENT_TIMEOUT_MS, which covers the answer
 * and the whole body (the adapter cuts the body at the attempt's deadline, and earlier when no
 * chunk arrives for LINE_CONTENT_IDLE_TIMEOUT_MS), and the Retry-After waits.
 */
export const contentDownloadWorstMs = (): number =>
  lineCallWorstMs(LINE_CONTENT_TIMEOUT_MS, LINE_MAX_RETRIES);

/** The LINE idle bound only ever ends an attempt earlier than its deadline. */
export const contentIdleWorstMs = (): number => LINE_CONTENT_IDLE_TIMEOUT_MS;

/** One transcoding status call: a single attempt, no retry. */
export const contentStatusWorstMs = (): number => lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, 0);

/** A video when LINE has it ready at once: the original, then the preview (downloads only). */
export const mediaDownloadsWorstMs = (): number => contentDownloadWorstMs() * 2;

/**
 * Storing one inbound file in FileStorage after it is read: the upload (STORAGE_PUT_TIMEOUT_MS,
 * the SDK's own retries included) and the inspect (STORAGE_CALL_TIMEOUT_MS).
 */
export const mediaStoreWorstMs = (): number => STORAGE_PUT_TIMEOUT_MS + STORAGE_CALL_TIMEOUT_MS;

/**
 * StoreInboundMedia for content LINE has ready at once (an image, audio, or a video without its
 * preview): the download and the store, every step at its bound. A video's preview is fetched
 * only when the budget left still holds a download and a store.
 */
export const mediaFileJobWorstMs = (): number => contentDownloadWorstMs() + mediaStoreWorstMs();

/**
 * StoreInboundMedia: MEDIA_JOB_BUDGET_MS. Each step is only started when the budget still holds
 * its worst case (the use case checks the elapsed time against the domain reserves pinned in
 * timing-budget.spec.ts), and the job is cut and marked failed when the budget passes, whatever
 * step it is in, so this is a hard bound and not an estimate.
 */
export const mediaJobWorstMs = (): number => MEDIA_JOB_BUDGET_MS;

/** ExtractDocument: the conversion, then count_tokens. */
export const extractJobWorstMs = (): number =>
  callDeadlineMs({ timeoutMs: CLAUDE_EXTRACT_TIMEOUT_MS, maxRetries: CLAUDE_EXTRACT_MAX_RETRIES }) +
  callDeadlineMs({
    timeoutMs: CLAUDE_COUNT_TOKENS_TIMEOUT_MS,
    maxRetries: CLAUDE_EXTRACT_MAX_RETRIES,
  });

// Worst cases of requests the screens wait for (the client timeouts of timeouts.contract.ts).

/** POST /api/settings/guard/test: one topic guard call with its retry. */
export const guardTestWorstMs = (): number =>
  callDeadlineMs({ timeoutMs: GUARD_TIMEOUT_MS, maxRetries: CLAUDE_GUARD_MAX_RETRIES });

/** A rich menu call that retries (set or clear the default, delete). */
const richMenuCallWorstMs = (): number =>
  lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, LINE_MAX_RETRIES);

/**
 * POST /api/settings/rich-menu: create and upload (no retry), set the default, then either delete
 * the earlier menu or, after losing to a concurrent publish, set the winner again and delete its own.
 */
export const richMenuPublishWorstMs = (): number =>
  lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, 0) +
  lineCallWorstMs(LINE_CONTENT_TIMEOUT_MS, 0) +
  richMenuCallWorstMs() * 3;

/** DELETE /api/settings/rich-menu: clear the default, then delete the menu. */
export const richMenuRemoveWorstMs = (): number => richMenuCallWorstMs() * 2;

/**
 * PUT /api/settings/line-credentials and POST /api/settings/line/test: the bot of the access
 * token, then the client-credentials token, the bot of that channel and the revoke (no retry).
 */
export const lineCheckWorstMs = (): number =>
  lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, LINE_MAX_RETRIES) +
  lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, 0) * 3;
