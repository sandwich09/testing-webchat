import { describe, expect, it } from 'vitest';
import type { TopicGuardRequest } from '@/core/ports';
import { FAKE_GUARD_USAGE, FakeTopicGuard } from './fake-topic-guard';
import { describeTopicGuardSuite } from './suites/topic-guard.suite';

const request = (extra: Partial<TopicGuardRequest> = {}): TopicGuardRequest => ({
  topics: ['มุกตลกไทย'],
  message: 'เล่ามุกหน่อย',
  context: [],
  model: 'claude-haiku-5-5',
  maxTokens: 2000,
  timeoutMs: 10_000,
  ...extra,
});

describeTopicGuardSuite(() => {
  const topicGuard = new FakeTopicGuard();
  return {
    topicGuard,
    arrange: (scenario) => {
      switch (scenario.kind) {
        case 'verdict':
          topicGuard.enqueueVerdict(scenario.verdict);
          break;
        case 'invalid_output':
          topicGuard.enqueueInvalidOutput();
          break;
        case 'refused':
          topicGuard.enqueueRefusal();
          break;
        case 'truncated':
          topicGuard.enqueueTruncated();
          break;
        case 'error':
          topicGuard.enqueueError(scenario.code);
          break;
      }
      return Promise.resolve();
    },
  };
});

describe('FakeTopicGuard test controls', () => {
  it('answers allowed: true with no topic when nothing is queued', async () => {
    const guard = new FakeTopicGuard();
    expect(await guard.classify(request())).toEqual({
      ok: true,
      value: {
        stop: 'completed',
        verdict: { allowed: true, matchedTopic: null },
        usage: FAKE_GUARD_USAGE,
        servedModel: 'claude-haiku-5-5',
      },
    });
  });

  it('serves queued answers first in, first out, then falls back to the default', async () => {
    const guard = new FakeTopicGuard().enqueueBlocked().enqueueAllowed('มุกตลกไทย');
    expect(guard.pendingCount).toBe(2);
    const a = await guard.classify(request());
    const b = await guard.classify(request());
    const c = await guard.classify(request());
    expect(a.ok && a.value.verdict).toEqual({ allowed: false, matchedTopic: null });
    expect(b.ok && b.value.verdict).toEqual({ allowed: true, matchedTopic: 'มุกตลกไทย' });
    expect(c.ok && c.value.verdict).toEqual({ allowed: true, matchedTopic: null });
    expect(guard.pendingCount).toBe(0);
  });

  it('keeps a copy of every request', async () => {
    const guard = new FakeTopicGuard();
    const req = request({ context: [{ role: 'customer', text: 'ก่อนหน้า' }] });
    await guard.classify(req);
    req.topics.push('changed');
    req.context.push({ role: 'shop', text: 'changed' });
    await guard.classify(request({ message: 'ขออีกมุก' }));
    expect(guard.requests).toEqual([
      request({ context: [{ role: 'customer', text: 'ก่อนหน้า' }] }),
      request({ message: 'ขออีกมุก' }),
    ]);
  });

  it('reports the requested model unless told otherwise and uses the given usage', async () => {
    const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
    const guard = new FakeTopicGuard()
      .enqueueRefusal(usage)
      .enqueueAllowed(null, { servedModel: 'claude-haiku-5-5-other' });
    const a = await guard.classify(request());
    const b = await guard.classify(request());
    expect(a.ok && a.value).toEqual({
      stop: 'refused',
      verdict: null,
      usage,
      servedModel: 'claude-haiku-5-5',
    });
    expect(b.ok && b.value.servedModel).toBe('claude-haiku-5-5-other');
  });

  it('runs a scripted function with the request', async () => {
    const guard = new FakeTopicGuard().enqueue((req) => ({
      ok: true,
      value: {
        stop: 'completed',
        verdict: { allowed: true, matchedTopic: req.topics[0] ?? null },
        usage: FAKE_GUARD_USAGE,
        servedModel: req.model,
      },
    }));
    const r = await guard.classify(request({ topics: ['มีม'] }));
    expect(r.ok && r.value.verdict?.matchedTopic).toBe('มีม');
  });

  it('returns a queued error', async () => {
    const guard = new FakeTopicGuard().enqueueError('ai.rate_limited');
    const r = await guard.classify(request());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('ai.rate_limited');
  });
});
