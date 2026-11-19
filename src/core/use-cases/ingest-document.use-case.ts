import type { AiModelId, DocumentId, ErrorCode, KbDocument, UsageOutcome } from '@/core/domain';
import {
  AI_EXTRACT_MAX_TOKENS,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  bangkokDayRange,
  computeCost,
  err,
  isNoResponse,
  knowledgeOverflow,
  noResponseUsage,
  ok,
  sniffContentType,
} from '@/core/domain';
import type { ExtractResponse } from '@/core/ports';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

/** Background job (phase B), run after the response. */
export interface ExtractFollowUp {
  documentId: DocumentId;
  bytes: Uint8Array;
  model: AiModelId;
}

export type IngestDocumentInput = {
  fileName: string;
  bytes: Uint8Array;
  retryOf: DocumentId | null;
};

export type IngestDocumentOutput = { document: KbDocument; followUp: ExtractFollowUp };

export type IngestDocumentDeps = Pick<
  AllPorts,
  | 'rateLimits'
  | 'hasher'
  | 'knowledge'
  | 'settings'
  | 'usage'
  | 'extractor'
  | 'ids'
  | 'clock'
  | 'logger'
>;

/** Bytes read to sniff the file type. */
const SNIFF_BYTES = 16;

/**
 * Phase A (in the request): checks the file, then creates the row in `processing` or restarts a
 * failed one. The PDF is not stored: the route hands `followUp` to `runJob` → ExtractDocument.
 */
export const makeIngestDocument: (
  deps: IngestDocumentDeps,
  config: UseCaseConfig,
) => UseCase<
  IngestDocumentInput,
  IngestDocumentOutput,
  | 'knowledge.rate_limited'
  | 'knowledge.file_too_large'
  | 'knowledge.not_pdf'
  | 'knowledge.duplicate'
  | 'knowledge.not_found'
  | 'knowledge.not_retryable'
  | 'ai.budget_exhausted'
> = (deps, config) => {
  const { hasher, knowledge, settings, usage, ids, clock, logger } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);

  return async ({ fileName, bytes, retryOf: requestedRetryOf }, ctx) => {
    const now = clock.now();

    const limit = await hitRateLimit('pdf_ingest', ctx.clientIp ?? 'unknown', now);
    if (limit.limited) return err('knowledge.rate_limited', undefined, limit.retryAfterSeconds);

    if (bytes.length > PDF_MAX_BYTES) return err('knowledge.file_too_large');
    if (sniffContentType(bytes.subarray(0, SNIFF_BYTES)) !== 'application/pdf') {
      return err('knowledge.not_pdf');
    }

    const sha256 = hasher.sha256(bytes);
    const existing = await knowledge.findBySha256(sha256);

    let retryOf = requestedRetryOf;
    if (retryOf !== null) {
      const target = await knowledge.findById(retryOf);
      if (target === null) return err('knowledge.not_found');
      if (target.status !== 'failed') return err('knowledge.not_retryable');
      if (existing !== null && existing.id !== retryOf) return err('knowledge.duplicate');
    } else if (existing !== null) {
      // The same file uploaded again after it failed counts as a retry of that row.
      if (existing.status !== 'failed') return err('knowledge.duplicate');
      retryOf = existing.id;
    }

    // The budget counts ingest cost too (usage-cost.md). The kill switch only stops customer
    // replies, so it is not checked here.
    const s = await settings.get();
    if ((await usage.sumCost(bangkokDayRange(now))) >= s.aiDailyBudget) {
      return err('ai.budget_exhausted');
    }

    const file = { fileName, sizeBytes: bytes.length, sha256, now };
    // A concurrent request with the same file loses on the unique sha256 and gets duplicate. A
    // concurrent retry of the same failed row loses the compare-and-set of restartProcessing and
    // gets not_retryable, so only one extraction starts; an upload without retryOf that lost it
    // met a row that is now processing, which is a duplicate as without the race.
    const saved =
      retryOf === null
        ? await knowledge.create({ id: ids.documentId(), ...file })
        : await knowledge.restartProcessing(retryOf, file);
    if (!saved.ok) {
      return requestedRetryOf === null && saved.error.code === 'knowledge.not_retryable'
        ? err('knowledge.duplicate')
        : saved;
    }
    const document = saved.value;

    logger.log('info', 'knowledge.ingest.started', {
      requestId: ctx.requestId,
      documentId: document.id,
      sizeBytes: bytes.length,
    });
    return ok({ document, followUp: { documentId: document.id, bytes, model: s.aiModel } });
  };
};

export type ExtractDocumentDeps = Pick<
  AllPorts,
  'extractor' | 'knowledge' | 'usage' | 'settings' | 'ids' | 'clock' | 'logger'
>;

/** Phase B of IngestDocument. Never leaves the row in `processing`. */
export type ExtractDocument = (job: ExtractFollowUp) => Promise<void>;

const usageOutcome = (
  stop: ExtractResponse['stop'],
): { outcome: UsageOutcome; error: ErrorCode | null } => {
  switch (stop) {
    case 'refused':
      return { outcome: 'refused', error: 'ai.refused' };
    case 'truncated':
      return { outcome: 'failed', error: 'ai.truncated' };
    case 'completed':
      return { outcome: 'ok', error: null };
  }
};

type Failed = {
  status: 'failed';
  code: ErrorCode;
  pageCount: number | null;
  tokenCount: number | null;
};
type Settled =
  { status: 'ready'; text: string; pageCount: number | null; tokenCount: number } | Failed;

const failed = (
  code: ErrorCode,
  pageCount: number | null = null,
  tokenCount: number | null = null,
): Failed => ({ status: 'failed', code, pageCount, tokenCount });

/**
 * Phase B (after the response): extracts the text, records the billed usage on every API answer
 * (also when the file is then rejected), and marks the row ready or failed. Throws only on an
 * unexpected failure, after marking the row failed with `internal.unexpected`.
 */
export const makeExtractDocument: (
  deps: ExtractDocumentDeps,
  config: UseCaseConfig,
) => ExtractDocument = (deps, { priceTable }) => {
  const { extractor, knowledge, usage, settings, ids, clock, logger } = deps;

  const recordUsage = async (documentId: DocumentId, r: ExtractResponse): Promise<void> => {
    const { cost, priceKnown } = computeCost(r.usage, r.servedModel, priceTable);
    if (!priceKnown) logger.log('warn', 'ai.price_unknown_model', { model: r.servedModel });
    await usage.insert({
      id: ids.usageId(),
      kind: 'ingest',
      contactId: null,
      messageId: null,
      documentId,
      provider: 'claude',
      model: r.servedModel,
      usage: r.usage,
      cost,
      ...usageOutcome(r.stop),
      createdAt: clock.now(),
    });
  };

  const settle = async ({ documentId, bytes, model }: ExtractFollowUp): Promise<Settled> => {
    const res = await extractor.extract({ model, pdf: bytes, maxTokens: AI_EXTRACT_MAX_TOKENS });
    if (!res.ok) {
      // Sent without an answer: may be billed, so it gets a zero-cost row (usage-cost).
      if (isNoResponse(res.error.code)) {
        await usage.insert(
          noResponseUsage({
            id: ids.usageId(),
            kind: 'ingest',
            contactId: null,
            documentId,
            provider: 'claude',
            model,
            createdAt: clock.now(),
          }),
        );
      }
      await settings.recordAiError({ code: res.error.code, at: clock.now() });
      return failed('knowledge.extract_failed');
    }
    const r = res.value;
    // Billed on every API answer, also when the file is rejected below (knowledge-base.md).
    await recordUsage(documentId, r);

    if (r.stop === 'refused') return failed('knowledge.extract_refused');
    if (r.stop === 'truncated') return failed('knowledge.extract_failed');
    if (r.text === null) return failed('knowledge.extract_empty');
    const { text, pageCount } = r;
    // Pages are known only after extraction: there is no PDF reader.
    if (pageCount !== null && pageCount > PDF_MAX_PAGES) {
      return failed('knowledge.too_many_pages', pageCount);
    }

    // Not usage.outputTokens, which also counts the model's thinking (ai-prompt 7.3).
    const counted = await extractor.countTokens(model, text);
    if (!counted.ok) return failed('knowledge.extract_failed', pageCount);
    const tokenCount = counted.value;

    if (knowledgeOverflow(await knowledge.sumReadyTokens(), tokenCount) > 0) {
      return failed('knowledge.capacity_exceeded', pageCount, tokenCount);
    }
    return { status: 'ready', text, pageCount, tokenCount };
  };

  const markFailed = async (documentId: DocumentId, f: Failed): Promise<void> => {
    const { code, pageCount, tokenCount } = f;
    await knowledge.markFailed(documentId, { code, pageCount, tokenCount, now: clock.now() });
    logger.log('warn', 'knowledge.ingest.failed', { documentId, errorCode: code });
  };

  return async (job) => {
    const { documentId } = job;
    try {
      const s = await settle(job);
      if (s.status === 'failed') {
        await markFailed(documentId, s);
        return;
      }
      const { text, pageCount, tokenCount } = s;
      if (
        !(await knowledge.markReady(documentId, { text, pageCount, tokenCount, now: clock.now() }))
      ) {
        // Deleted while extracting: nothing left to update and not an error.
        logger.log('info', 'knowledge.ingest.failed', {
          documentId,
          errorCode: 'knowledge.not_found',
        });
        return;
      }
      logger.log('info', 'knowledge.ingest.succeeded', {
        documentId,
        pageCount: pageCount ?? undefined,
        tokenCount,
      });
    } catch (e) {
      try {
        await markFailed(documentId, failed('internal.unexpected'));
      } catch {
        // The original error is the one worth reporting: runJob logs it.
      }
      throw e;
    }
  };
};
