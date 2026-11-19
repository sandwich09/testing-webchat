import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentId, KbDocument, NanoUsd, TokenUsage } from '@/core/domain';
import {
  AI_EXTRACT_MAX_TOKENS,
  KNOWLEDGE_CAPACITY_TOKENS,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  PRICE_TABLE,
  RATE_LIMIT_RULES,
  computeCost,
  effectiveLimit,
} from '@/core/domain';
import {
  FakeClock,
  FakeContentHasher,
  FakeDocumentExtractor,
  FakeIdGenerator,
  FakeKnowledgeRepository,
  FakeLogger,
  FakeRateLimitRepository,
  FakeSettingsRepository,
  FakeUsageRepository,
} from '@/adapters/fakes';
import {
  type ExtractDocument,
  type ExtractFollowUp,
  type IngestDocumentDeps,
  makeExtractDocument,
  makeIngestDocument,
} from './ingest-document.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const ctx: RequestContext = { requestId: 'req-test', clientIp: '203.0.113.7' };

const config: UseCaseConfig = {
  appBaseUrl: 'http://localhost:3000',
  aiDebounceMs: 0,
  aiStuckAfterMs: 60_000,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};

const USAGE: TokenUsage = {
  inputTokens: 10_000,
  outputTokens: 2_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** A PDF header followed by filler bytes that differ per `seed`, so hashes differ. */
const pdf = (size: number, seed = 1): Uint8Array => {
  const bytes = new Uint8Array(size).fill(seed % 256);
  bytes.set(Array.from('%PDF-1.7\n', (c) => c.charCodeAt(0)));
  return bytes;
};

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Model text with one `=== หน้า N ===` separator per page. */
const pagesText = (pages: number): string =>
  Array.from(
    { length: pages },
    (_, i) => `=== หน้า ${String(i + 1)} ===\nเมนูกาแฟ ${String(i)}`,
  ).join('\n\n');

const SECRET_TEXT = 'ข้อความลับในไฟล์ 0812345678';

describe('IngestDocument', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let rateLimits: FakeRateLimitRepository;
  let hasher: FakeContentHasher;
  let knowledge: FakeKnowledgeRepository;
  let settings: FakeSettingsRepository;
  let usage: FakeUsageRepository;
  let extractor: FakeDocumentExtractor;
  let logger: FakeLogger;
  let deps: IngestDocumentDeps;
  let ingest: ReturnType<typeof makeIngestDocument>;
  let extract: ExtractDocument;

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    rateLimits = new FakeRateLimitRepository();
    hasher = new FakeContentHasher();
    knowledge = new FakeKnowledgeRepository();
    settings = new FakeSettingsRepository();
    usage = new FakeUsageRepository();
    extractor = new FakeDocumentExtractor();
    logger = new FakeLogger(clock);
    deps = { rateLimits, hasher, knowledge, settings, usage, extractor, ids, clock, logger };
    ingest = makeIngestDocument(deps, config);
    extract = makeExtractDocument(deps, config);
  });

  const upload = (bytes: Uint8Array, retryOf: DocumentId | null = null, fileName = 'menu.pdf') =>
    ingest({ fileName, bytes, retryOf }, ctx);

  /** Phase A must succeed; returns its output. */
  const accepted = async (bytes: Uint8Array, retryOf: DocumentId | null = null) => {
    const r = await upload(bytes, retryOf);
    if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
    return r.value;
  };

  /** Runs phase A and phase B, then returns the stored row. */
  const ingestFully = async (bytes: Uint8Array, retryOf: DocumentId | null = null) => {
    const { followUp } = await accepted(bytes, retryOf);
    await extract(followUp);
    return knowledge.getWithText(followUp.documentId);
  };

  const seedDoc = async (
    status: 'ready' | 'failed',
    seed: number,
    tokenCount = 100,
  ): Promise<KbDocument> => {
    const created = await knowledge.create({
      id: ids.documentId(),
      fileName: `seed-${String(seed)}.pdf`,
      sizeBytes: 1024,
      sha256: hasher.sha256(pdf(1024, seed)),
      now: clock.now(),
    });
    if (!created.ok) throw new Error('seed failed');
    const id = created.value.id;
    if (status === 'ready') {
      await knowledge.markReady(id, { text: 'x', pageCount: 1, tokenCount, now: clock.now() });
    } else {
      await knowledge.markFailed(id, {
        code: 'knowledge.extract_failed',
        pageCount: null,
        tokenCount: null,
        now: clock.now(),
      });
    }
    const row = await knowledge.findById(id);
    if (row === null) throw new Error('seed missing');
    return row;
  };

  const errorCode = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error?.code);

  const assertNoContentInLogs = () => {
    const dump = JSON.stringify(logger.entries);
    expect(dump).not.toContain(SECRET_TEXT);
    expect(dump).not.toContain('เมนูกาแฟ');
    expect(dump).not.toContain('%PDF');
    expect(dump).not.toContain('menu.pdf');
  };

  describe('phase A (in the request)', () => {
    it('creates a processing row for a new 1 MB PDF; followUp has the bytes and the set model', async () => {
      await settings.update({ aiModel: 'claude-sonnet-5-5' });
      const bytes = pdf(1024 * 1024);

      const { document, followUp } = await accepted(bytes);

      expect(document).toMatchObject({
        fileName: 'menu.pdf',
        sizeBytes: bytes.length,
        sha256: hasher.sha256(bytes),
        status: 'processing',
        error: null,
        pageCount: null,
        tokenCount: null,
      });
      expect(followUp).toEqual({
        documentId: document.id,
        bytes,
        model: 'claude-sonnet-5-5',
      });
      expect(await knowledge.findById(document.id)).toMatchObject({ status: 'processing' });
      // Extraction runs only in phase B.
      expect(extractor.extractRequests).toHaveLength(0);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'knowledge.ingest.started',
          documentId: document.id,
          sizeBytes: bytes.length,
          requestId: ctx.requestId,
        }),
      );
      assertNoContentInLogs();
    });

    it('accepts a file of exactly PDF_MAX_BYTES', async () => {
      expect(errorCode(await upload(pdf(PDF_MAX_BYTES)))).toBe('ok');
    });

    it('rejects a file of PDF_MAX_BYTES + 1 bytes with knowledge.file_too_large', async () => {
      expect(errorCode(await upload(pdf(PDF_MAX_BYTES + 1)))).toBe('knowledge.file_too_large');
      expect(await knowledge.list()).toHaveLength(0);
    });

    it('rejects a PNG named .pdf with knowledge.not_pdf', async () => {
      const png = new Uint8Array(2048);
      png.set(PNG_HEADER);
      expect(errorCode(await upload(png, null, 'menu.pdf'))).toBe('knowledge.not_pdf');
      expect(await knowledge.list()).toHaveLength(0);
    });

    it('rejects an empty file with knowledge.not_pdf', async () => {
      expect(errorCode(await upload(new Uint8Array(0)))).toBe('knowledge.not_pdf');
    });

    it('checks the size before the content type', async () => {
      const big = new Uint8Array(PDF_MAX_BYTES + 1);
      big.set(PNG_HEADER);
      expect(errorCode(await upload(big))).toBe('knowledge.file_too_large');
    });

    it('rejects the same file that is ready with knowledge.duplicate without calling the extractor', async () => {
      const ready = await seedDoc('ready', 7);
      const r = await upload(pdf(1024, 7));
      expect(errorCode(r)).toBe('knowledge.duplicate');
      expect(extractor.extractRequests).toHaveLength(0);
      expect(await knowledge.list()).toEqual([ready]);
    });

    it('rejects the same file that is still processing with knowledge.duplicate', async () => {
      await accepted(pdf(1024, 8));
      expect(errorCode(await upload(pdf(1024, 8)))).toBe('knowledge.duplicate');
      expect(await knowledge.list()).toHaveLength(1);
    });

    it('reuses the failed row when the same file is uploaded again, status processing', async () => {
      const failedRow = await seedDoc('failed', 9);
      clock.advance(1000);

      const { document, followUp } = await accepted(pdf(1024, 9));

      expect(document.id).toBe(failedRow.id);
      expect(document).toMatchObject({ status: 'processing', error: null, fileName: 'menu.pdf' });
      expect(followUp.documentId).toBe(failedRow.id);
      expect(await knowledge.list()).toHaveLength(1);
    });

    it('retries a failed row by retryOf with the same file', async () => {
      const failedRow = await seedDoc('failed', 10);
      const { document } = await accepted(pdf(1024, 10), failedRow.id);
      expect(document).toMatchObject({ id: failedRow.id, status: 'processing', error: null });
    });

    it('retries a failed row by retryOf with a different file, replacing the file values', async () => {
      const failedRow = await seedDoc('failed', 11);
      const bytes = pdf(2048, 12);
      const { document } = await accepted(bytes, failedRow.id);
      expect(document).toMatchObject({
        id: failedRow.id,
        status: 'processing',
        sizeBytes: 2048,
        sha256: hasher.sha256(bytes),
      });
      expect(await knowledge.list()).toHaveLength(1);
    });

    it('rejects retryOf of a ready row with knowledge.not_retryable', async () => {
      const ready = await seedDoc('ready', 13);
      expect(errorCode(await upload(pdf(1024, 13), ready.id))).toBe('knowledge.not_retryable');
      expect(await knowledge.findById(ready.id)).toEqual(ready);
    });

    it('rejects retryOf of a processing row with knowledge.not_retryable', async () => {
      const { document } = await accepted(pdf(1024, 14));
      expect(errorCode(await upload(pdf(1024, 14), document.id))).toBe('knowledge.not_retryable');
    });

    it('rejects retryOf with a file whose hash matches another row with knowledge.duplicate', async () => {
      const failedRow = await seedDoc('failed', 15);
      const other = await seedDoc('ready', 16);
      expect(errorCode(await upload(pdf(1024, 16), failedRow.id))).toBe('knowledge.duplicate');
      expect(await knowledge.findById(failedRow.id)).toMatchObject({ status: 'failed' });
      expect(await knowledge.findById(other.id)).toEqual(other);
    });

    it('rejects retryOf of a missing row with knowledge.not_found', async () => {
      const missing = ids.documentId();
      expect(errorCode(await upload(pdf(1024), missing))).toBe('knowledge.not_found');
    });

    it('passes knowledge.not_found on when the retried row is deleted before the restart', async () => {
      const failedRow = await seedDoc('failed', 17);
      const racing = makeIngestDocument(
        {
          ...deps,
          knowledge: Object.assign(Object.create(knowledge) as FakeKnowledgeRepository, {
            restartProcessing: async (
              id: DocumentId,
              d: Parameters<typeof knowledge.restartProcessing>[1],
            ) => {
              await knowledge.delete(id);
              return knowledge.restartProcessing(id, d);
            },
          }),
        },
        config,
      );
      const r = await racing(
        { fileName: 'a.pdf', bytes: pdf(1024, 17), retryOf: failedRow.id },
        ctx,
      );
      expect(errorCode(r)).toBe('knowledge.not_found');
    });

    it('returns ai.budget_exhausted when today is at the budget and adds no row', async () => {
      const s = await settings.get();
      await usage.insert({
        id: ids.usageId(),
        kind: 'reply',
        contactId: null,
        messageId: null,
        documentId: null,
        provider: 'claude',
        model: 'claude-opus-5-5',
        usage: USAGE,
        cost: s.aiDailyBudget,
        outcome: 'ok',
        error: null,
        createdAt: clock.now(),
      });

      expect(errorCode(await upload(pdf(1024)))).toBe('ai.budget_exhausted');
      expect(await knowledge.list()).toHaveLength(0);
    });

    it('returns ai.budget_exhausted for a retry and leaves the failed row as it was', async () => {
      const failedRow = await seedDoc('failed', 18);
      await settings.update({ aiDailyBudget: 0n as NanoUsd }); // brand: test budget
      expect(errorCode(await upload(pdf(1024, 18), failedRow.id))).toBe('ai.budget_exhausted');
      expect(await knowledge.findById(failedRow.id)).toEqual(failedRow);
    });

    it('counts ingest cost toward the daily budget', async () => {
      const s = await settings.get();
      // One extraction costs more than the whole budget.
      const huge: TokenUsage = { ...USAGE, inputTokens: 10_000_000 };
      expect(computeCost(huge, 'claude-opus-5-5', PRICE_TABLE).cost).toBeGreaterThan(
        s.aiDailyBudget,
      );
      extractor.enqueueText(pagesText(1), { usage: huge });
      await ingestFully(pdf(1024, 1));

      expect(errorCode(await upload(pdf(1024, 2)))).toBe('ai.budget_exhausted');
    });

    it('ignores spend from yesterday (Bangkok day)', async () => {
      const s = await settings.get();
      await usage.insert({
        id: ids.usageId(),
        kind: 'ingest',
        contactId: null,
        messageId: null,
        documentId: null,
        provider: 'claude',
        model: 'claude-opus-5-5',
        usage: USAGE,
        cost: s.aiDailyBudget,
        outcome: 'ok',
        error: null,
        // 2026-11-17 23:59 Bangkok time, the day before the clock.
        createdAt: new Date('2026-11-17T16:59:00.000Z'),
      });
      expect(errorCode(await upload(pdf(1024)))).toBe('ok');
    });

    it('still accepts an upload when the AI kill switch is off', async () => {
      expect((await settings.get()).aiEnabled).toBe(false);
      expect(errorCode(await upload(pdf(1024)))).toBe('ok');
    });

    it('returns knowledge.rate_limited with retryAfterSeconds over the limit, retries included', async () => {
      const limit = effectiveLimit('pdf_ingest', config.rateLimitScale);
      const failedRow = await seedDoc('failed', 19);
      for (let i = 0; i < limit - 1; i += 1) await upload(pdf(1024, 100 + i));
      expect(errorCode(await upload(pdf(1024, 19), failedRow.id))).toBe('ok');

      const r = await upload(pdf(1024, 200));
      expect(errorCode(r)).toBe('knowledge.rate_limited');
      expect(r.ok ? null : r.error.retryAfterSeconds).toBe(
        RATE_LIMIT_RULES.pdf_ingest.windowMs / 1000,
      );
    });

    it('checks the rate limit before anything else and counts rejected files', async () => {
      const limit = effectiveLimit('pdf_ingest', config.rateLimitScale);
      for (let i = 0; i < limit; i += 1) await upload(new Uint8Array(0));
      expect(errorCode(await upload(pdf(PDF_MAX_BYTES + 1)))).toBe('knowledge.rate_limited');
    });

    it('uses "unknown" as the rate limit subject when the IP is not known', async () => {
      const noIp: RequestContext = { requestId: 'r', clientIp: null };
      const limit = effectiveLimit('pdf_ingest', config.rateLimitScale);
      for (let i = 0; i < limit; i += 1) {
        await ingest({ fileName: 'a.pdf', bytes: new Uint8Array(0), retryOf: null }, noIp);
      }
      const r = await ingest({ fileName: 'a.pdf', bytes: pdf(1024), retryOf: null }, noIp);
      expect(errorCode(r)).toBe('knowledge.rate_limited');
      // Another IP still has its own bucket.
      expect(errorCode(await upload(pdf(1024)))).toBe('ok');
    });

    it('two concurrent uploads of the same file give one document and one extraction', async () => {
      const bytes = pdf(4096, 21);
      let creates = 0;
      const counting = makeIngestDocument(
        {
          ...deps,
          knowledge: Object.assign(Object.create(knowledge) as FakeKnowledgeRepository, {
            create: (d: Parameters<typeof knowledge.create>[0]) => {
              creates += 1;
              return knowledge.create(d);
            },
          }),
        },
        config,
      );
      const run = () => counting({ fileName: 'menu.pdf', bytes, retryOf: null }, ctx);
      const results = await Promise.all([run(), run()]);

      // Both passed the sha256 lookup; the unique constraint decided.
      expect(creates).toBe(2);
      const oks = results.filter((r) => r.ok);
      expect(oks).toHaveLength(1);
      expect(results.map(errorCode).sort()).toEqual(['knowledge.duplicate', 'ok']);
      expect(await knowledge.list()).toHaveLength(1);

      extractor.enqueueText(pagesText(1));
      for (const r of results) if (r.ok) await extract(r.value.followUp);
      expect(extractor.extractRequests).toHaveLength(1);
    });
  });

  describe('concurrent retries of one failed row', () => {
    const counted = () => {
      const calls = { restarts: 0 };
      const run = makeIngestDocument(
        {
          ...deps,
          knowledge: Object.assign(Object.create(knowledge) as FakeKnowledgeRepository, {
            restartProcessing: (
              id: DocumentId,
              d: Parameters<typeof knowledge.restartProcessing>[1],
            ) => {
              calls.restarts += 1;
              return knowledge.restartProcessing(id, d);
            },
          }),
        },
        config,
      );
      return { calls, run };
    };

    it('two concurrent retries by retryOf give one extraction; the other gets knowledge.not_retryable', async () => {
      const failedRow = await seedDoc('failed', 30);
      const { calls, run } = counted();
      const retry = () =>
        run({ fileName: 'menu.pdf', bytes: pdf(1024, 30), retryOf: failedRow.id }, ctx);

      const results = await Promise.all([retry(), retry()]);

      // Both passed the status check; the compare-and-set decided.
      expect(calls.restarts).toBe(2);
      expect(results.map(errorCode).sort()).toEqual(['knowledge.not_retryable', 'ok']);
      extractor.enqueueText(pagesText(1));
      for (const r of results) if (r.ok) await extract(r.value.followUp);
      expect(extractor.extractRequests).toHaveLength(1);
      expect(await knowledge.findById(failedRow.id)).toMatchObject({ status: 'ready' });
    });

    it('two concurrent uploads of a failed file without retryOf give one extraction; the other gets knowledge.duplicate', async () => {
      await seedDoc('failed', 31);
      const { calls, run } = counted();
      const again = () => run({ fileName: 'menu.pdf', bytes: pdf(1024, 31), retryOf: null }, ctx);

      const results = await Promise.all([again(), again()]);

      expect(calls.restarts).toBe(2);
      expect(results.map(errorCode).sort()).toEqual(['knowledge.duplicate', 'ok']);
      expect(await knowledge.list()).toHaveLength(1);
    });
  });

  describe('phase B (after the response)', () => {
    const start = async (seed = 1): Promise<ExtractFollowUp> =>
      (await accepted(pdf(2048, seed))).followUp;

    const usageRow = () => {
      expect(usage.records).toHaveLength(1);
      const [row] = usage.records;
      if (row === undefined) throw new Error('no usage row');
      return row;
    };

    it('extracts 3 pages and 1,200 tokens → ready, AiUsage kind ingest outcome ok', async () => {
      const followUp = await start();
      extractor.tokenCounter = () => 1200;
      extractor.enqueueText(`\r\n  ${pagesText(3)}\r\n\r\n\r\n\r\n${SECRET_TEXT}  \n`, {
        usage: USAGE,
      });

      await extract(followUp);

      const row = await knowledge.getWithText(followUp.documentId);
      expect(row).toMatchObject({ status: 'ready', error: null, pageCount: 3, tokenCount: 1200 });
      // Cleaned per ai-prompt 7.3: CRLF → LF, trimmed, blank-line runs collapsed.
      expect(row?.extractedText).toBe(`${pagesText(3)}\n\n${SECRET_TEXT}`);
      expect(extractor.extractRequests).toEqual([
        { model: followUp.model, pdf: followUp.bytes, maxTokens: AI_EXTRACT_MAX_TOKENS },
      ]);
      // The token count comes from countTokens on the cleaned text, not usage.outputTokens.
      expect(extractor.countTokensRequests).toEqual([
        { model: followUp.model, text: row?.extractedText },
      ]);
      expect(usageRow()).toEqual({
        id: expect.any(String) as string,
        kind: 'ingest',
        contactId: null,
        messageId: null,
        documentId: followUp.documentId,
        provider: 'claude',
        model: followUp.model,
        usage: USAGE,
        cost: computeCost(USAGE, followUp.model, PRICE_TABLE).cost,
        outcome: 'ok',
        error: null,
        createdAt: clock.now(),
      });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'knowledge.ingest.succeeded',
          documentId: followUp.documentId,
          pageCount: 3,
          tokenCount: 1200,
        }),
      );
      assertNoContentInLogs();
    });

    it('accepts exactly PDF_MAX_PAGES separators', async () => {
      const followUp = await start();
      extractor.enqueueText(pagesText(PDF_MAX_PAGES));
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'ready',
        pageCount: PDF_MAX_PAGES,
      });
    });

    it('keeps pageCount null when the text has no separators', async () => {
      const followUp = await start();
      extractor.enqueueText('ข้อความไม่มีตัวคั่น');
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'ready',
        pageCount: null,
      });
      expect(
        logger.entries.find((e) => e.event === 'knowledge.ingest.succeeded'),
      ).not.toHaveProperty('pageCount');
    });

    it('PDF_MAX_PAGES + 1 separators → failed knowledge.too_many_pages, AiUsage recorded with cost', async () => {
      const followUp = await start();
      extractor.enqueueText(pagesText(PDF_MAX_PAGES + 1), { usage: USAGE });

      await extract(followUp);

      const row = await knowledge.getWithText(followUp.documentId);
      expect(row).toMatchObject({
        status: 'failed',
        error: 'knowledge.too_many_pages',
        pageCount: PDF_MAX_PAGES + 1,
        tokenCount: null,
        extractedText: null,
      });
      const u = usageRow();
      expect(u).toMatchObject({ kind: 'ingest', outcome: 'ok', error: null });
      expect(u.cost).toBe(computeCost(USAGE, followUp.model, PRICE_TABLE).cost);
      expect(u.cost).toBeGreaterThan(0n);
      expect(extractor.countTokensRequests).toHaveLength(0);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'knowledge.ingest.failed',
          errorCode: 'knowledge.too_many_pages',
        }),
      );
    });

    it('EMPTY_DOCUMENT → failed knowledge.extract_empty, AiUsage recorded', async () => {
      const followUp = await start();
      extractor.enqueueText('  EMPTY_DOCUMENT\r\n');
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.extract_empty',
      });
      expect(usageRow()).toMatchObject({ kind: 'ingest', outcome: 'ok', error: null });
      expect(extractor.countTokensRequests).toHaveLength(0);
    });

    it('an empty text → failed knowledge.extract_empty', async () => {
      const followUp = await start();
      extractor.enqueueText(' \n\n ');
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        error: 'knowledge.extract_empty',
      });
      expect(usage.records).toHaveLength(1);
    });

    it('library at capacity − 500, adding 600 → failed knowledge.capacity_exceeded tokenCount 600', async () => {
      await seedDoc('ready', 50, KNOWLEDGE_CAPACITY_TOKENS - 500);
      const followUp = await start();
      extractor.tokenCounter = () => 600;
      extractor.enqueueText(pagesText(2));

      await extract(followUp);

      expect(await knowledge.getWithText(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.capacity_exceeded',
        tokenCount: 600,
        pageCount: 2,
        extractedText: null,
      });
      expect(await knowledge.sumReadyTokens()).toBe(KNOWLEDGE_CAPACITY_TOKENS - 500);
      expect(usageRow()).toMatchObject({ outcome: 'ok' });
    });

    it('exactly filling KNOWLEDGE_CAPACITY_TOKENS → ready', async () => {
      await seedDoc('ready', 51, KNOWLEDGE_CAPACITY_TOKENS - 500);
      const followUp = await start();
      extractor.tokenCounter = () => 500;
      extractor.enqueueText(pagesText(1));

      await extract(followUp);

      expect(await knowledge.findById(followUp.documentId)).toMatchObject({ status: 'ready' });
      expect(await knowledge.sumReadyTokens()).toBe(KNOWLEDGE_CAPACITY_TOKENS);
    });

    it('a refusal → failed knowledge.extract_refused, AiUsage outcome refused', async () => {
      const followUp = await start();
      extractor.enqueueRefusal(USAGE);
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.extract_refused',
      });
      expect(usageRow()).toMatchObject({
        kind: 'ingest',
        outcome: 'refused',
        error: 'ai.refused',
        cost: computeCost(USAGE, followUp.model, PRICE_TABLE).cost,
      });
    });

    it('truncated → failed knowledge.extract_failed, AiUsage error ai.truncated', async () => {
      const followUp = await start();
      extractor.enqueueTruncated(USAGE);
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.extract_failed',
      });
      expect(usageRow()).toMatchObject({ outcome: 'failed', error: 'ai.truncated' });
    });

    it('API down → failed knowledge.extract_failed, no AiUsage, lastAiError recorded', async () => {
      const followUp = await start();
      extractor.enqueueError('ai.unavailable');
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.extract_failed',
      });
      expect(usage.records).toHaveLength(0);
      expect((await settings.get()).lastAiError).toEqual({
        code: 'ai.unavailable',
        at: clock.now(),
      });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'knowledge.ingest.failed',
          documentId: followUp.documentId,
          errorCode: 'knowledge.extract_failed',
        }),
      );
    });

    it('no answer from the API → failed knowledge.extract_failed and a zero-cost ingest row', async () => {
      const followUp = await start();
      extractor.enqueueError('ai.no_response');
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.extract_failed',
      });
      expect(usage.records).toEqual([
        expect.objectContaining({
          kind: 'ingest',
          documentId: followUp.documentId,
          contactId: null,
          model: followUp.model,
          outcome: 'failed',
          error: 'ai.no_response',
          cost: 0n,
        }),
      ]);
      expect((await settings.get()).lastAiError?.code).toBe('ai.no_response');
    });

    it('countTokens fails → failed knowledge.extract_failed, the extraction cost still recorded', async () => {
      const followUp = await start();
      extractor.enqueueText(pagesText(2));
      extractor.enqueueCountTokensError('ai.rate_limited');
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'knowledge.extract_failed',
        pageCount: 2,
        tokenCount: null,
      });
      expect(usage.records).toHaveLength(1);
    });

    it('an unknown served model is priced at the highest price and logs ai.price_unknown_model', async () => {
      const followUp = await start();
      extractor.enqueueText(pagesText(1), { usage: USAGE, servedModel: 'claude-mystery-9' });
      await extract(followUp);

      const priced = computeCost(USAGE, 'claude-mystery-9', PRICE_TABLE);
      expect(priced.priceKnown).toBe(false);
      expect(usageRow()).toMatchObject({ model: 'claude-mystery-9', cost: priced.cost });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'ai.price_unknown_model', model: 'claude-mystery-9' }),
      );
    });

    it('records the served model, not the requested one', async () => {
      const followUp = await start();
      extractor.enqueueText(pagesText(1), { usage: USAGE, servedModel: 'claude-opus-5' });
      await extract(followUp);
      expect(usageRow()).toMatchObject({
        model: 'claude-opus-5',
        cost: computeCost(USAGE, 'claude-opus-5', PRICE_TABLE).cost,
      });
      expect(logger.eventsOf()).not.toContain('ai.price_unknown_model');
    });

    it('a row deleted during extraction → no error', async () => {
      const followUp = await start();
      extractor.enqueue((req) => {
        void knowledge.delete(followUp.documentId);
        return {
          ok: true,
          value: {
            stop: 'completed',
            text: pagesText(1),
            pageCount: 1,
            usage: USAGE,
            servedModel: req.model,
          },
        };
      });

      await expect(extract(followUp)).resolves.toBeUndefined();
      expect(await knowledge.findById(followUp.documentId)).toBeNull();
      expect(usage.records).toHaveLength(1);
      expect(logger.eventsOf()).not.toContain('knowledge.ingest.succeeded');
    });

    it('a row deleted during extraction that then fails → no error', async () => {
      const followUp = await start();
      extractor.enqueue(() => {
        void knowledge.delete(followUp.documentId);
        return { ok: false, error: { code: 'ai.unavailable' } };
      });
      await expect(extract(followUp)).resolves.toBeUndefined();
    });

    it('the extractor throws → row failed internal.unexpected and the error is rethrown', async () => {
      const followUp = await start();
      // Empty queue: the fake throws.
      await expect(extract(followUp)).rejects.toThrow('no result enqueued');
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'internal.unexpected',
      });
    });

    it('recording usage throws → row failed internal.unexpected, never left processing', async () => {
      const followUp = await start();
      extractor.enqueueText(pagesText(1));
      const failing = makeExtractDocument(
        {
          ...deps,
          usage: Object.assign(Object.create(usage) as FakeUsageRepository, {
            insert: () => Promise.reject(new Error('db down')),
          }),
        },
        config,
      );
      await expect(failing(followUp)).rejects.toThrow('db down');
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'failed',
        error: 'internal.unexpected',
      });
    });

    it('rethrows the original error when marking the row failed also throws', async () => {
      const followUp = await start();
      const broken = makeExtractDocument(
        {
          ...deps,
          knowledge: Object.assign(Object.create(knowledge) as FakeKnowledgeRepository, {
            markFailed: () => Promise.reject(new Error('db down')),
          }),
        },
        config,
      );
      await expect(broken(followUp)).rejects.toThrow('no result enqueued');
    });

    it('a failed file can be retried and becomes ready; each billed call has its own AiUsage row', async () => {
      const followUp = await start(30);
      extractor.enqueueTruncated(USAGE);
      await extract(followUp);
      expect(await knowledge.findById(followUp.documentId)).toMatchObject({ status: 'failed' });

      const retried = await accepted(pdf(2048, 30), followUp.documentId);
      expect(retried.document).toMatchObject({ id: followUp.documentId, status: 'processing' });
      extractor.enqueueText(pagesText(2), { usage: USAGE });
      await extract(retried.followUp);

      expect(await knowledge.findById(followUp.documentId)).toMatchObject({
        status: 'ready',
        pageCount: 2,
      });
      expect(usage.records.map((u) => [u.kind, u.documentId, u.outcome])).toEqual([
        ['ingest', followUp.documentId, 'failed'],
        ['ingest', followUp.documentId, 'ok'],
      ]);
      expect(new Set(usage.records.map((u) => u.id)).size).toBe(2);
    });
  });
});
