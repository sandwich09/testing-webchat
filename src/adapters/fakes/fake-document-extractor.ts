import type { AiModelId, Result, TokenUsage } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { DocumentExtractor, ExtractRequest, ExtractResponse } from '@/core/ports';
import { FAKE_USAGE } from './fake-chat-model';

export type FakeExtractorErrorCode =
  'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

type ExtractResult = Result<ExtractResponse, FakeExtractorErrorCode>;
type ScriptedExtract = ExtractResult | ((req: ExtractRequest) => ExtractResult);
type CountResult = Result<number, FakeExtractorErrorCode>;

const PAGE_SEPARATOR = /^=== หน้า \d+ ===$/gm;

/**
 * ai-prompt 7.3: CRLF becomes LF, leading and trailing whitespace is cut, runs of blank lines
 * collapse to one, and an empty text or the word EMPTY_DOCUMENT means no text (null).
 * `pageCount` is the number of page separators found, null if none.
 */
export const interpretExtractedText = (
  modelText: string,
): { text: string | null; pageCount: number | null } => {
  const text = modelText
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n');
  if (text === '' || text === 'EMPTY_DOCUMENT') return { text: null, pageCount: null };
  const separators = text.match(PAGE_SEPARATOR)?.length ?? 0;
  return { text, pageCount: separators === 0 ? null : separators };
};

/**
 * Scripted DocumentExtractor. Queue results for `extract` with `enqueue*`; a call with an empty
 * queue throws. `countTokens` uses `tokenCounter` (default: one token per 4 characters, rounded up)
 * unless an error was queued with `enqueueCountTokensError`.
 */
export class FakeDocumentExtractor implements DocumentExtractor {
  readonly extractRequests: ExtractRequest[] = [];
  readonly countTokensRequests: { model: AiModelId; text: string }[] = [];
  tokenCounter: (text: string) => number = (text) => Math.ceil(text.length / 4);
  private readonly queue: ScriptedExtract[] = [];
  private readonly countErrors: FakeExtractorErrorCode[] = [];

  enqueue(...results: ScriptedExtract[]): this {
    this.queue.push(...results);
    return this;
  }

  /** A completed answer whose raw model text goes through the 7.3 clean-up. */
  enqueueText(modelText: string, opts: { usage?: TokenUsage; servedModel?: string } = {}): this {
    return this.enqueue((req) =>
      ok({
        stop: 'completed',
        ...interpretExtractedText(modelText),
        usage: opts.usage ?? FAKE_USAGE,
        servedModel: opts.servedModel ?? req.model,
      }),
    );
  }

  enqueueRefusal(usage: TokenUsage = FAKE_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'refused', text: null, pageCount: null, usage, servedModel: req.model }),
    );
  }

  enqueueTruncated(usage: TokenUsage = FAKE_USAGE): this {
    return this.enqueue((req) =>
      ok({ stop: 'truncated', text: null, pageCount: null, usage, servedModel: req.model }),
    );
  }

  enqueueError(code: FakeExtractorErrorCode): this {
    return this.enqueue(err(code));
  }

  /** The next `countTokens` call fails with this code. */
  enqueueCountTokensError(code: FakeExtractorErrorCode): this {
    this.countErrors.push(code);
    return this;
  }

  extract(req: ExtractRequest): Promise<ExtractResult> {
    this.extractRequests.push({ ...req, pdf: req.pdf.slice() });
    const next = this.queue.shift();
    if (next === undefined) {
      return Promise.reject(new Error('FakeDocumentExtractor: no result enqueued'));
    }
    return Promise.resolve(typeof next === 'function' ? next(req) : next);
  }

  countTokens(model: AiModelId, text: string): Promise<CountResult> {
    this.countTokensRequests.push({ model, text });
    const code = this.countErrors.shift();
    if (code !== undefined) return Promise.resolve(err(code));
    return Promise.resolve(ok(this.tokenCounter(text)));
  }
}
