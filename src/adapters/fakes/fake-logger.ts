import type { Clock, LogEvent, Logger, LogFields, LogLevel } from '@/core/ports';
import { FakeClock } from './fake-clock';

/** Every key of `LogFields`. Anything else is dropped, so a cast cannot smuggle PII into a log. */
export const LOG_FIELD_KEYS = [
  'requestId',
  'contactId',
  'messageId',
  'documentId',
  'usageId',
  'cannedReplyId',
  'route',
  'method',
  'httpStatus',
  'durationMs',
  'errorCode',
  'errorName',
  'lineEventType',
  'eventCount',
  'channel',
  'attempt',
  'outcome',
  'reason',
  'model',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'costNanoUsd',
  'sizeBytes',
  'pageCount',
  'tokenCount',
  'count',
] as const satisfies readonly (keyof LogFields)[];

// Compile-time check that the list above is complete.
type MissingKey = Exclude<keyof LogFields, (typeof LOG_FIELD_KEYS)[number]>;
export const LOG_FIELD_KEYS_COMPLETE: [MissingKey] extends [never] ? true : never = true;

/** One log line as the real adapter writes it: `{ ts, level, event, ...fields }`. */
export type FakeLogEntry = { ts: string; level: LogLevel; event: LogEvent } & Record<
  string,
  unknown
>;

const ALLOWED: ReadonlySet<string> = new Set(LOG_FIELD_KEYS);

export class FakeLogger implements Logger {
  readonly entries: FakeLogEntry[] = [];
  private readonly clock: Clock;

  constructor(clock: Clock = new FakeClock()) {
    this.clock = clock;
  }

  log(level: LogLevel, event: LogEvent, fields?: LogFields): void {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (ALLOWED.has(key) && value !== undefined) kept[key] = value;
    }
    this.entries.push({ ts: this.clock.now().toISOString(), level, event, ...kept });
  }

  eventsOf(level?: LogLevel): LogEvent[] {
    return this.entries.filter((e) => level === undefined || e.level === level).map((e) => e.event);
  }
}
