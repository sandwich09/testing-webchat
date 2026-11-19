import { describe, expect, it } from 'vitest';
import { FakeClock } from './fake-clock';
import { FakeLogger } from './fake-logger';
import { describeLoggerSuite } from './suites/logger.suite';

describeLoggerSuite(() => {
  const logger = new FakeLogger();
  return { logger, lines: () => Promise.resolve(logger.entries.map((e) => ({ ...e }))) };
});

describe('FakeLogger test controls', () => {
  it('stamps entries with the clock and lists events by level', () => {
    const clock = new FakeClock(new Date('2026-11-18T00:00:00Z'));
    const logger = new FakeLogger(clock);
    logger.log('info', 'access.unlock.succeeded');
    logger.log('error', 'job.run.failed');
    expect(logger.entries[0]?.ts).toBe('2026-11-18T00:00:00.000Z');
    expect(logger.eventsOf('error')).toEqual(['job.run.failed']);
    expect(logger.eventsOf()).toEqual(['access.unlock.succeeded', 'job.run.failed']);
  });
});
