import type { ChatOutput, ModelHandoffReason, Result, TokenUsage } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { ChatModel, ChatModelRequest, ChatModelResponse } from '@/core/ports';

export type FakeChatModelErrorCode =
  'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

type ChatResult = Result<ChatModelResponse, FakeChatModelErrorCode>;
type Scripted = ChatResult | ((req: ChatModelRequest) => ChatResult);

export const FAKE_USAGE: TokenUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** The model output as the model wrote it: `handoffReason` may be missing when `needsAdmin` is true. */
export interface FakeRawChatOutput {
  reply: string;
  needsAdmin: boolean;
  handoffReason: ModelHandoffReason | null;
}

/** ChatModel contract: a needsAdmin answer without a reason is reported as `other`. */
export const normalizeChatOutput = (raw: FakeRawChatOutput): ChatOutput => ({
  reply: raw.reply,
  needsAdmin: raw.needsAdmin,
  handoffReason: raw.needsAdmin ? (raw.handoffReason ?? 'other') : raw.handoffReason,
});

/**
 * Scripted ChatModel. Tests queue the results with `enqueue*` (first in, first out) and read the
 * requests the code under test sent from `requests`. A call with an empty queue throws, so a
 * test never passes by accident on a made-up answer.
 */
export class FakeChatModel implements ChatModel {
  /** Every request received, in order. `now` is copied so later mutation cannot change it. */
  readonly requests: ChatModelRequest[] = [];
  private readonly queue: Scripted[] = [];

  enqueue(...results: Scripted[]): this {
    this.queue.push(...results);
    return this;
  }

  /** A completed answer. */
  enqueueReply(
    output: FakeRawChatOutput,
    opts: { usage?: TokenUsage; servedModel?: string } = {},
  ): this {
    return this.enqueue((req) =>
      ok({
        stop: 'completed',
        output: normalizeChatOutput(output),
        usage: opts.usage ?? FAKE_USAGE,
        servedModel: opts.servedModel ?? req.model,
      }),
    );
  }

  /** A completed answer whose JSON did not match the schema, so `output` is null. */
  enqueueInvalidOutput(usage: TokenUsage = FAKE_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'completed', output: null, usage, servedModel: req.model }),
    );
  }

  enqueueRefusal(usage: TokenUsage = FAKE_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'refused', output: null, usage, servedModel: req.model }),
    );
  }

  enqueueTruncated(usage: TokenUsage = FAKE_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'truncated', output: null, usage, servedModel: req.model }),
    );
  }

  enqueueError(code: FakeChatModelErrorCode): this {
    return this.enqueue(err(code));
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  generateReply(req: ChatModelRequest): Promise<ChatResult> {
    this.requests.push({
      ...req,
      history: req.history.map((t) => ({ ...t })),
      now: new Date(req.now),
    });
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.reject(new Error('FakeChatModel: no result enqueued'));
    }
    return Promise.resolve(typeof next === 'function' ? next(req) : next);
  }
}
