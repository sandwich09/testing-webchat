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
  LINE_CONTENT_TIMEOUT_MS,
  LINE_LOADING_MAX_RETRIES,
  LINE_MAX_RETRIES,
  LINE_PROFILE_TIMEOUT_MS,
  LINE_REQUEST_TIMEOUT_MS,
  LINE_RETRY_AFTER_MAX_MS,
} from '@/adapters/line';
import { AI_MAX_ROUNDS_PER_RUN, GUARD_TIMEOUT_MS, MEDIA_JOB_BUDGET_MS } from '@/core/domain';

// Worst-case durations of the work that runs after a response (docs/architecture/project-setup.md
// section 10.4, "เวลาแย่ที่สุด"). Every value is computed from the real constants, and
// timing-budget.spec.ts pins each inequality, so a change of a timeout, a retry count or a round
// that no longer fits a function's maxDuration fails the build.

/**
 * Share of a function's maxDuration that the worst case of its jobs may use. The rest is the
 * margin for what has no timeout of its own: database calls (a Neon cold start included), file
 * storage and the work before the response.
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

/** POST /api/line/webhook: one profile fetch before the response, then the longest job. */
export const webhookWorstMs = (debounceMs: number): number =>
  lineCallWorstMs(LINE_PROFILE_TIMEOUT_MS, 0) +
  Math.max(aiRunWorstMs(debounceMs), mediaJobWorstMs());

/** One content download from LINE (the store into Blob has no timeout of its own). */
export const contentDownloadWorstMs = (): number =>
  lineCallWorstMs(LINE_CONTENT_TIMEOUT_MS, LINE_MAX_RETRIES);

/** One transcoding status call: a single attempt, no retry. */
export const contentStatusWorstMs = (): number => lineCallWorstMs(LINE_REQUEST_TIMEOUT_MS, 0);

/** A video when LINE has it ready at once: the original, then the preview. */
export const mediaDownloadsWorstMs = (): number => contentDownloadWorstMs() * 2;

/**
 * StoreInboundMedia: MEDIA_JOB_BUDGET_MS. While LINE prepares the content the job waits and asks
 * again only when the budget still holds the worst case of every step left (the use case checks
 * the elapsed time against the domain reserves pinned in timing-budget.spec.ts).
 */
export const mediaJobWorstMs = (): number => MEDIA_JOB_BUDGET_MS;

/** ExtractDocument: the conversion, then count_tokens. */
export const extractJobWorstMs = (): number =>
  callDeadlineMs({ timeoutMs: CLAUDE_EXTRACT_TIMEOUT_MS, maxRetries: CLAUDE_EXTRACT_MAX_RETRIES }) +
  callDeadlineMs({
    timeoutMs: CLAUDE_COUNT_TOKENS_TIMEOUT_MS,
    maxRetries: CLAUDE_EXTRACT_MAX_RETRIES,
  });
