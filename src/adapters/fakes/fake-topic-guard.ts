import type { Result, TokenUsage, TopicVerdict } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { TopicGuard, TopicGuardRequest, TopicGuardResponse } from '@/core/ports';

export type FakeTopicGuardErrorCode =
  'ai.unavailable' | 'ai.no_response' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

type GuardResult = Result<TopicGuardResponse, FakeTopicGuardErrorCode>;
type Scripted = GuardResult | ((req: TopicGuardRequest) => GuardResult);

/** Usage of every scripted answer unless told otherwise: the default guard answer of the stub. */
export const FAKE_GUARD_USAGE: TokenUsage = {
  inputTokens: 400,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

interface AnswerOptions {
  usage?: TokenUsage;
  servedModel?: string;
}

/**
 * Scripted TopicGuard. Tests queue answers with `enqueue*` (first in, first out) and read the
 * requests the code under test sent from `requests`. With an empty queue it answers
 * `allowed: true` with no matched topic, so a test that does not care about the guard passes it.
 */
export class FakeTopicGuard implements TopicGuard {
  /** Every request received, in order. Copied, so later mutation by the caller cannot change it. */
  readonly requests: TopicGuardRequest[] = [];
  private readonly queue: Scripted[] = [];

  enqueue(...results: Scripted[]): this {
    this.queue.push(...results);
    return this;
  }

  /** A completed answer that matches the schema. */
  enqueueVerdict(verdict: TopicVerdict, opts: AnswerOptions = {}): this {
    return this.enqueue((req) =>
      ok({
        stop: 'completed',
        verdict: { allowed: verdict.allowed, matchedTopic: verdict.matchedTopic },
        usage: opts.usage ?? FAKE_GUARD_USAGE,
        servedModel: opts.servedModel ?? req.model,
      }),
    );
  }

  enqueueAllowed(matchedTopic: string | null = null, opts: AnswerOptions = {}): this {
    return this.enqueueVerdict({ allowed: true, matchedTopic }, opts);
  }

  enqueueBlocked(opts: AnswerOptions = {}): this {
    return this.enqueueVerdict({ allowed: false, matchedTopic: null }, opts);
  }

  /** A completed answer whose JSON did not match the schema, so `verdict` is null. */
  enqueueInvalidOutput(usage: TokenUsage = FAKE_GUARD_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'completed', verdict: null, usage, servedModel: req.model }),
    );
  }

  enqueueRefusal(usage: TokenUsage = FAKE_GUARD_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'refused', verdict: null, usage, servedModel: req.model }),
    );
  }

  enqueueTruncated(usage: TokenUsage = FAKE_GUARD_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'truncated', verdict: null, usage, servedModel: req.model }),
    );
  }

  /** No answer from the API at all. */
  enqueueError(code: FakeTopicGuardErrorCode): this {
    return this.enqueue(err(code));
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  classify(req: TopicGuardRequest): Promise<GuardResult> {
    this.requests.push({
      ...req,
      topics: [...req.topics],
      context: req.context.map((t) => ({ ...t })),
    });
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.resolve(
        ok({
          stop: 'completed',
          verdict: { allowed: true, matchedTopic: null },
          usage: { ...FAKE_GUARD_USAGE },
          servedModel: req.model,
        }),
      );
    }
    return Promise.resolve(typeof next === 'function' ? next(req) : next);
  }
}
