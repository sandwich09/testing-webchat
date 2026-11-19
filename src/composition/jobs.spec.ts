import { describe, expect, it } from 'vitest';
import { ok, type ContactId, type DocumentId, type MessageId } from '@/core/domain';
import { FakeLogger } from '@/adapters/fakes';
import { makeJobs, type JobDeps } from './jobs';
import { makeRunJob } from './route';

const ctx = { requestId: 'req-7', clientIp: '203.0.113.1' };

const setup = (overrides: Partial<JobDeps> = {}) => {
  const tasks: (() => Promise<void>)[] = [];
  const logger = new FakeLogger();
  const calls: string[] = [];
  const deps: JobDeps = {
    runJob: makeRunJob({ schedule: (t) => tasks.push(t), logger: () => logger }),
    storeInboundMedia: (input, c) => {
      calls.push(`media:${input.messageId}:${c.requestId}`);
      return Promise.resolve(ok({ status: 'ready' as const }));
    },
    generateAiReply: (input, c) => {
      calls.push(`ai:${input.contactId}:${input.triggerMessageId}:${c.requestId}`);
      return Promise.resolve(ok({ outcome: 'sent' } as never));
    },
    handleRichMenuAction: (input, c) => {
      calls.push(`tap:${input.action}:${input.tapMessageId}:${c.requestId}`);
      const aiReply =
        input.action === 'ai_on'
          ? { contactId: input.contactId, triggerMessageId: input.tapMessageId }
          : null;
      return Promise.resolve(
        ok({
          outcome: aiReply === null ? ('how_to_sent' as const) : ('ai_started' as const),
          aiReply,
        }),
      );
    },
    sendWelcome: (input, c) => {
      calls.push(`welcome:${input.contactId}:${input.replyToken}:${c.requestId}`);
      return Promise.resolve(ok({ outcome: 'disabled' as const }));
    },
    extractDocument: (job) => {
      calls.push(`extract:${job.documentId}:${String(job.bytes.byteLength)}:${job.model}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { jobs: makeJobs(() => deps), tasks, logger, calls };
};

describe('scheduleLineFollowUps', () => {
  it('runs nothing before the response, then each follow-up as its own job', async () => {
    const { jobs, tasks, calls } = setup();
    jobs.scheduleLineFollowUps(
      [
        { kind: 'store_media', messageId: 'm1' as MessageId },
        { kind: 'ai_reply', contactId: 'c1' as ContactId, triggerMessageId: 'm2' as MessageId },
      ],
      ctx,
    );
    expect(calls).toEqual([]);
    expect(tasks).toHaveLength(2);
    for (const t of tasks) await t();
    expect(calls).toEqual(['media:m1:req-7', 'ai:c1:m2:req-7']);
  });

  it('runs a tap, then GenerateAiReply in the same job only when the tap starts the AI', async () => {
    const { jobs, tasks, calls } = setup();
    jobs.scheduleLineFollowUps(
      [
        {
          kind: 'rich_menu_action',
          contactId: 'c1' as ContactId,
          action: 'ai_on',
          tapMessageId: 'm1' as MessageId,
        },
        {
          kind: 'rich_menu_action',
          contactId: 'c1' as ContactId,
          action: 'how_to',
          tapMessageId: 'm2' as MessageId,
        },
        { kind: 'welcome', contactId: 'c2' as ContactId, replyToken: 'rt-1' },
      ],
      ctx,
    );
    expect(tasks).toHaveLength(3);
    for (const t of tasks) await t();
    expect(calls).toEqual([
      'tap:ai_on:m1:req-7',
      'ai:c1:m1:req-7',
      'tap:how_to:m2:req-7',
      'welcome:c2:rt-1:req-7',
    ]);
  });

  it('schedules nothing for an empty list', () => {
    const { jobs, tasks } = setup();
    jobs.scheduleLineFollowUps([], ctx);
    expect(tasks).toHaveLength(0);
  });

  it('keeps going when one job throws, logging job.run.failed with its ids', async () => {
    const { jobs, tasks, calls, logger } = setup({
      storeInboundMedia: () => Promise.reject(new Error('disk full')),
    });
    jobs.scheduleLineFollowUps(
      [
        { kind: 'store_media', messageId: 'm1' as MessageId },
        { kind: 'ai_reply', contactId: 'c1' as ContactId, triggerMessageId: 'm2' as MessageId },
      ],
      ctx,
    );
    for (const t of tasks) await t();
    expect(calls).toEqual(['ai:c1:m2:req-7']);
    expect(logger.entries).toEqual([
      expect.objectContaining({
        event: 'job.run.failed',
        requestId: 'req-7',
        route: '/api/line/webhook',
        messageId: 'm1',
        errorName: 'Error',
      }),
    ]);
  });
});

describe('scheduleDocumentExtraction', () => {
  it('runs phase B after the response with the follow-up of IngestDocument', async () => {
    const { jobs, tasks, calls, logger } = setup();
    jobs.scheduleDocumentExtraction(
      {
        documentId: 'd1' as DocumentId,
        bytes: new Uint8Array(3),
        model: 'claude-opus-5-5',
      },
      ctx,
      '/api/knowledge/documents',
    );
    expect(calls).toEqual([]);
    await tasks[0]?.();
    expect(calls).toEqual(['extract:d1:3:claude-opus-5-5']);
    expect(logger.entries).toEqual([]);
  });

  it('logs job.run.failed with the document id when phase B throws', async () => {
    const { jobs, tasks, logger } = setup({
      extractDocument: () => Promise.reject(new TypeError('x')),
    });
    jobs.scheduleDocumentExtraction(
      {
        documentId: 'd2' as DocumentId,
        bytes: new Uint8Array(1),
        model: 'claude-opus-5-5',
      },
      ctx,
      '/api/knowledge/documents/:id/retry',
    );
    await tasks[0]?.();
    expect(logger.entries[0]).toMatchObject({
      event: 'job.run.failed',
      documentId: 'd2',
      route: '/api/knowledge/documents/:id/retry',
      errorName: 'TypeError',
    });
  });
});
