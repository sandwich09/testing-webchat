import { describe, expect, it, vi } from 'vitest';
import { describeLoggerSuite } from '@/adapters/fakes';
import type { LogFields } from '@/core/ports';
import { createJsonLogger } from './json-logger.adapter';

/** Captures what the logger writes to the real stdout. Restored after each test (restoreMocks). */
const captureStdout = (): string[] => {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  });
  return chunks;
};

const parseLines = (chunks: string[]): Record<string, unknown>[] => {
  const text = chunks.join('');
  expect(text.endsWith('\n')).toBe(true);
  return text
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

describeLoggerSuite(() => {
  const chunks = captureStdout();
  return { logger: createJsonLogger(), lines: () => Promise.resolve(parseLines(chunks)) };
});

describe('createJsonLogger', () => {
  const collect = (): { lines: string[]; write: (line: string) => void } => {
    const lines: string[] = [];
    return { lines, write: (line) => lines.push(line) };
  };

  it('writes exactly one JSON object per line, starting with ts, level and event', () => {
    const sink = collect();
    const logger = createJsonLogger({ write: sink.write, now: () => new Date(0) });
    logger.log('warn', 'line.send.failed', { channel: 'push', errorCode: 'line.unavailable' });
    expect(sink.lines).toEqual([
      '{"ts":"1970-01-01T00:00:00.000Z","level":"warn","event":"line.send.failed","channel":"push","errorCode":"line.unavailable"}\n',
    ]);
  });

  it('escapes newlines inside values so one call is still one line', () => {
    const sink = collect();
    createJsonLogger({ write: sink.write }).log('info', 'http.request.completed', {
      route: 'a\nb',
    });
    expect(sink.lines[0]?.split('\n')).toHaveLength(2);
  });

  it('drops keys outside LogFields and values that are not strings or finite numbers', () => {
    const sink = collect();
    const error = new Error('library message with สวัสดี');
    createJsonLogger({ write: sink.write }).log('error', 'job.run.failed', {
      errorName: error,
      count: Number.NaN,
      durationMs: 5,
      attempt: 1n,
      route: { text: 'hi' },
      ip: '203.0.113.7',
      __proto__: { polluted: true },
      constructor: 'x',
    } as unknown as LogFields);
    const line = JSON.parse(sink.lines[0] ?? '{}') as Record<string, unknown>;
    expect(Object.keys(line)).toEqual(['ts', 'level', 'event', 'durationMs']);
    expect(sink.lines[0]).not.toContain('สวัสดี');
    expect(sink.lines[0]).not.toContain('203.0.113.7');
  });

  it('ignores fields that are not an object', () => {
    const sink = collect();
    const logger = createJsonLogger({ write: sink.write });
    // Casts let a string and null through at runtime.
    logger.log('info', 'access.unlock.succeeded', 'secret' as unknown as LogFields);
    logger.log('info', 'access.unlock.succeeded', null as unknown as LogFields);
    expect(sink.lines).toHaveLength(2);
    for (const line of sink.lines) {
      expect(Object.keys(JSON.parse(line) as object)).toEqual(['ts', 'level', 'event']);
    }
  });

  it('never throws, even when writing or reading the time fails', () => {
    const failingWrite = createJsonLogger({
      write: () => {
        throw new Error('EPIPE');
      },
    });
    const failingTime = createJsonLogger({ now: () => new Date(Number.NaN) });
    expect(() => {
      failingWrite.log('info', 'access.unlock.succeeded');
    }).not.toThrow();
    expect(() => {
      failingTime.log('info', 'access.unlock.succeeded');
    }).not.toThrow();
  });
});
