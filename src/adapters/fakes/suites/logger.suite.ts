import { describe, expect, it } from 'vitest';
import type { ContactId } from '@/core/domain';
import type { LogFields, Logger } from '@/core/ports';

export interface LoggerHarness {
  logger: Logger;
  /**
   * Every line the logger has written since the harness was made, as parsed JSON objects: the
   * fake returns its entries, the real adapter reads captured stdout.
   */
  lines(): Promise<Record<string, unknown>[]>;
}

/** Runs every row of the Logger contract in domain-and-ports against the subject. */
export const describeLoggerSuite = (
  makeHarness: () => LoggerHarness | Promise<LoggerHarness>,
): void => {
  describe('Logger', () => {
    it('writes one line per call with ts, level, event and the fields', async () => {
      const h = await makeHarness();
      h.logger.log('info', 'http.request.completed', {
        route: '/api/contacts/:id/messages',
        method: 'GET',
        httpStatus: 200,
        durationMs: 12,
      });
      const lines = await h.lines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        level: 'info',
        event: 'http.request.completed',
        route: '/api/contacts/:id/messages',
        method: 'GET',
        httpStatus: 200,
        durationMs: 12,
      });
      expect(typeof lines[0]?.ts).toBe('string');
      expect(Number.isNaN(Date.parse(lines[0]?.ts as string))).toBe(false);
    });

    it('works without fields and keeps the order of calls', async () => {
      const h = await makeHarness();
      h.logger.log('info', 'access.unlock.succeeded');
      h.logger.log('warn', 'access.unlock.failed');
      h.logger.log('error', 'job.run.failed', { errorName: 'TypeError' });
      const lines = await h.lines();
      expect(lines.map((l) => [l.level, l.event])).toEqual([
        ['info', 'access.unlock.succeeded'],
        ['warn', 'access.unlock.failed'],
        ['error', 'job.run.failed'],
      ]);
    });

    it('keeps the ids and numbers it is given', async () => {
      const h = await makeHarness();
      h.logger.log('info', 'ai.model.called', {
        contactId: 'c-1' as ContactId,
        model: 'claude-opus-5-5',
        inputTokens: 10,
        outputTokens: 5,
        costNanoUsd: '12345',
        outcome: 'completed',
      });
      expect((await h.lines())[0]).toMatchObject({
        contactId: 'c-1',
        model: 'claude-opus-5-5',
        inputTokens: 10,
        outputTokens: 5,
        costNanoUsd: '12345',
        outcome: 'completed',
      });
    });

    it('drops keys that are not in LogFields, even when a cast sneaks them in', async () => {
      const h = await makeHarness();
      const sneaky = {
        count: 1,
        text: 'สวัสดีค่ะ ขอสอบถามหน่อย',
        lineUserId: 'U1234567890',
        displayName: 'สมชาย',
        message: 'error message of a library',
        token: 'secret-token',
      } as LogFields;
      h.logger.log('info', 'line.webhook.received', sneaky);
      const line = (await h.lines())[0] ?? {};
      expect(line.count).toBe(1);
      for (const forbidden of ['text', 'lineUserId', 'displayName', 'message', 'token']) {
        expect(line).not.toHaveProperty(forbidden);
      }
      expect(JSON.stringify(line)).not.toContain('สวัสดี');
      expect(JSON.stringify(line)).not.toContain('U1234567890');
    });

    it('does not let a field overwrite level, event or ts', async () => {
      const h = await makeHarness();
      h.logger.log('info', 'access.unlock.succeeded', {
        level: 'error',
        event: 'x',
        ts: 'x',
      } as LogFields);
      const line = (await h.lines())[0] ?? {};
      expect(line.level).toBe('info');
      expect(line.event).toBe('access.unlock.succeeded');
      expect(line.ts).not.toBe('x');
    });
  });
};
