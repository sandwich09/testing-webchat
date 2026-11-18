import { describe, expect, it } from 'vitest';
import type { ChatModelRequest } from '@/core/ports';
import { FakeChatModel } from './fake-chat-model';
import { describeChatModelSuite } from './suites/chat-model.suite';

const request = (extra: Partial<ChatModelRequest> = {}): ChatModelRequest => ({
  model: 'claude-opus-5-5',
  systemInstructions: 'sys',
  knowledgeText: '<knowledge></knowledge>',
  history: [{ role: 'customer', text: 'hi' }],
  now: new Date('2026-11-18T03:00:00Z'),
  maxTokens: 100,
  ...extra,
});

describeChatModelSuite(() => {
  const chatModel = new FakeChatModel();
  return {
    chatModel,
    arrange: (scenario) => {
      switch (scenario.kind) {
        case 'completed':
          chatModel.enqueueReply(scenario.output);
          break;
        case 'invalid_output':
          chatModel.enqueueInvalidOutput();
          break;
        case 'refused':
          chatModel.enqueueRefusal();
          break;
        case 'truncated':
          chatModel.enqueueTruncated();
          break;
        case 'error':
          chatModel.enqueueError(scenario.code);
          break;
      }
      return Promise.resolve();
    },
  };
});

describe('FakeChatModel test controls', () => {
  it('keeps the now of every request', async () => {
    const model = new FakeChatModel().enqueueRefusal().enqueueRefusal();
    const now = new Date('2026-11-18T03:00:00Z');
    await model.generateReply(request({ now }));
    now.setTime(0);
    await model.generateReply(request({ now: new Date('2026-12-01T00:00:00Z') }));
    expect(model.requests.map((r) => r.now.toISOString())).toEqual([
      '2026-11-18T03:00:00.000Z',
      '2026-12-01T00:00:00.000Z',
    ]);
  });

  it('serves queued results first in, first out and counts what is pending', async () => {
    const model = new FakeChatModel().enqueueError('ai.unavailable').enqueueRefusal();
    expect(model.pendingCount).toBe(2);
    expect((await model.generateReply(request())).ok).toBe(false);
    expect((await model.generateReply(request())).ok).toBe(true);
    expect(model.pendingCount).toBe(0);
  });

  it('reports the requested model as served model unless told otherwise', async () => {
    const model = new FakeChatModel()
      .enqueueRefusal()
      .enqueueReply(
        { reply: 'x', needsAdmin: false, handoffReason: null },
        { servedModel: 'claude-other' },
      );
    const a = await model.generateReply(request());
    const b = await model.generateReply(request());
    expect(a.ok && a.value.servedModel).toBe('claude-opus-5-5');
    expect(b.ok && b.value.servedModel).toBe('claude-other');
  });

  it('throws when nothing is queued, and still records the request', async () => {
    const model = new FakeChatModel();
    await expect(model.generateReply(request())).rejects.toThrow('no result enqueued');
    expect(model.requests).toHaveLength(1);
  });
});
