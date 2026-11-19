import type { LogEvent, Logger, LogFields, LogLevel } from '@/core/ports';

/**
 * Every key of `LogFields`, and nothing else: the Record type makes a missing key or an extra
 * key a compile error. Anything not listed is dropped, so a cast cannot smuggle PII into a log.
 */
const LOG_FIELD_KEYS: Record<keyof LogFields, true> = {
  requestId: true,
  contactId: true,
  messageId: true,
  documentId: true,
  usageId: true,
  route: true,
  method: true,
  httpStatus: true,
  durationMs: true,
  errorCode: true,
  errorName: true,
  lineEventType: true,
  eventCount: true,
  channel: true,
  attempt: true,
  outcome: true,
  reason: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  cacheReadTokens: true,
  cacheWriteTokens: true,
  costNanoUsd: true,
  sizeBytes: true,
  stage: true,
  pageCount: true,
  tokenCount: true,
  count: true,
};

const ALLOWED: ReadonlySet<string> = new Set(Object.keys(LOG_FIELD_KEYS));

/** Every LogFields value is a string or a number; anything else (objects, errors) is dropped. */
const isLoggable = (value: unknown): value is string | number =>
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

export interface JsonLoggerOptions {
  /** Where each line goes. Defaults to stdout. */
  write?: (line: string) => void;
  /** Source of `ts`. Defaults to the system time. */
  now?: () => Date;
}

const writeStdout = (line: string): void => {
  process.stdout.write(line);
};

/** One JSON object per line: `{ ts, level, event, ...fields }`. Never throws. */
export const createJsonLogger = (options: JsonLoggerOptions = {}): Logger => {
  const write = options.write ?? writeStdout;
  const now = options.now ?? (() => new Date());

  return {
    log(level: LogLevel, event: LogEvent, fields?: LogFields): void {
      try {
        const line: Record<string, unknown> = { ts: now().toISOString(), level, event };
        // `?? {}` also covers a null cast in; a string cast in yields only index keys.
        for (const [key, value] of Object.entries(fields ?? {})) {
          // ts, level and event are not in the allow list, so a field cannot overwrite them.
          if (ALLOWED.has(key) && isLoggable(value)) line[key] = value;
        }
        write(`${JSON.stringify(line)}\n`);
      } catch {
        // Logging must never break the request or job that called it.
      }
    },
  };
};
