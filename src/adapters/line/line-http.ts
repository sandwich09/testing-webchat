import { LINE_RETRY_AFTER_MAX_MS, LINE_RETRY_BASE_DELAY_MS } from './line.constants';

// One HTTP exchange with LINE: plain fetch, a timeout per attempt, and retries for network
// failures, 5xx and 429 only (docs/specs/line-messaging.md, "ส่งข้อความ" rule 6). Never throws
// for provider or network failures.

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

export const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type LineOutcome =
  /**
   * 2xx; the body is not read yet. `signal` is the attempt's timeout: it fires `timeoutMs` after
   * the attempt started, so a caller that reads a long body can bound that read with it too.
   */
  | { kind: 'ok'; response: Response; signal: AbortSignal }
  /** Any other status; the (small) error body has been read and released. */
  | { kind: 'error'; status: number; headers: Headers; message: string | null }
  | { kind: 'timeout' }
  | { kind: 'network' };

export interface LineRequest {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  maxRetries: number;
}

export interface LineExchange {
  outcome: LineOutcome;
  /**
   * True when an earlier attempt ended without a known result (network failure, timeout or
   * 5xx), so LINE may already have acted on the request.
   */
  earlierAttemptUnknown: boolean;
  attempts: number;
}

/** Error bodies from LINE are small JSON; anything beyond this is not read. */
const ERROR_BODY_MAX_BYTES = 16 * 1024;

/**
 * Assumption (ต้องยืนยันกับเอกสาร LINE): the monthly push quota is answered with 429 and a
 * message about the "monthly limit", while plain rate limiting is a 429 with another message.
 * docs/architecture/domain-and-ports.md says the two are told apart by LINE's message.
 */
export const isMonthlyQuotaError = (status: number, message: string | null): boolean =>
  status === 429 && message !== null && /monthly limit/i.test(message);

const isUnknownResult = (o: LineOutcome): boolean =>
  o.kind === 'timeout' || o.kind === 'network' || (o.kind === 'error' && o.status >= 500);

const isRetryable = (o: LineOutcome): boolean =>
  isUnknownResult(o) ||
  (o.kind === 'error' && o.status === 429 && !isMonthlyQuotaError(o.status, o.message));

/** Retry-After as delta-seconds or an HTTP date, in milliseconds; null when absent or invalid. */
export const retryAfterMs = (headers: Headers, nowMs: number): number | null => {
  const value = headers.get('retry-after')?.trim();
  if (value === undefined || value === '') return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
};

/** `retryAfterSeconds` for a `.rate_limited` error, when LINE said how long to wait. */
export const retryAfterSeconds = (o: LineOutcome): number | undefined => {
  if (o.kind !== 'error') return undefined;
  const ms = retryAfterMs(o.headers, Date.now());
  return ms === null ? undefined : Math.ceil(ms / 1000);
};

const isTimeoutError = (e: unknown): boolean =>
  e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

const readCapped = async (response: Response, maxBytes: number): Promise<string> => {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (size >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
};

const errorMessage = async (response: Response): Promise<string | null> => {
  try {
    const parsed: unknown = JSON.parse(await readCapped(response, ERROR_BODY_MAX_BYTES));
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      return typeof parsed.message === 'string' ? parsed.message : null;
    }
    return null;
  } catch {
    return null;
  }
};

const attemptOnce = async (fetchFn: FetchFn, req: LineRequest): Promise<LineOutcome> => {
  const signal = AbortSignal.timeout(req.timeoutMs);
  try {
    const response = await fetchFn(req.url, {
      ...req.init,
      // A redirect could leave the fixed LINE host; never follow one. The 3xx comes back as an
      // ordinary error answer, which is not retried.
      redirect: 'manual',
      signal,
    });
    if (response.status >= 200 && response.status < 300) {
      return { kind: 'ok', response, signal };
    }
    return {
      kind: 'error',
      status: response.status,
      headers: response.headers,
      message: await errorMessage(response),
    };
  } catch (e) {
    return isTimeoutError(e) ? { kind: 'timeout' } : { kind: 'network' };
  }
};

/** Sends the request, retrying up to `maxRetries` times for network failures, 5xx and 429. */
export const exchange = async (
  fetchFn: FetchFn,
  sleep: SleepFn,
  req: LineRequest,
): Promise<LineExchange> => {
  let earlierAttemptUnknown = false;
  for (let attempt = 1; ; attempt += 1) {
    const outcome = await attemptOnce(fetchFn, req);
    if (attempt > req.maxRetries || !isRetryable(outcome)) {
      return { outcome, earlierAttemptUnknown, attempts: attempt };
    }
    const asked = outcome.kind === 'error' ? retryAfterMs(outcome.headers, Date.now()) : null;
    // LINE asked for a longer wait than this call can afford: report it instead of waiting.
    if (asked !== null && asked > LINE_RETRY_AFTER_MAX_MS) {
      return { outcome, earlierAttemptUnknown, attempts: attempt };
    }
    earlierAttemptUnknown ||= isUnknownResult(outcome);
    await sleep(asked ?? LINE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }
};

/** Reads a 2xx JSON body; null when it is not JSON or cannot be read in time. */
export const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

/** Releases a 2xx body that is not needed. */
export const discard = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined);
};
