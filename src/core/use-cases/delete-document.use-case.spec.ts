import { beforeEach, describe, expect, it } from 'vitest';
import { PRICE_TABLE } from '@/core/domain';
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
import { makeDeleteDocument } from './delete-document.use-case';
import { makeExtractDocument, makeIngestDocument } from './ingest-document.use-case';
import { makeListDocuments } from './list-documents.use-case';
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

const pdf = (seed: number): Uint8Array => {
  const bytes = new Uint8Array(1024).fill(seed);
  bytes.set(Array.from('%PDF-1.7\n', (c) => c.charCodeAt(0)));
  return bytes;
};

describe('DeleteDocument', () => {
  let clock: FakeClock;
  let knowledge: FakeKnowledgeRepository;
  let extractor: FakeDocumentExtractor;
  let usage: FakeUsageRepository;
  let logger: FakeLogger;
  let ingest: ReturnType<typeof makeIngestDocument>;
  let extract: ReturnType<typeof makeExtractDocument>;
  let del: ReturnType<typeof makeDeleteDocument>;
  let list: ReturnType<typeof makeListDocuments>;

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    knowledge = new FakeKnowledgeRepository();
    extractor = new FakeDocumentExtractor();
    usage = new FakeUsageRepository();
    logger = new FakeLogger(clock);
    const deps = {
      rateLimits: new FakeRateLimitRepository(),
      hasher: new FakeContentHasher(),
      knowledge,
      settings: new FakeSettingsRepository(),
      usage,
      extractor,
      ids: new FakeIdGenerator(clock),
      clock,
      logger,
    };
    ingest = makeIngestDocument(deps, config);
    extract = makeExtractDocument(deps, config);
    del = makeDeleteDocument({ knowledge, logger }, config);
    list = makeListDocuments({ knowledge }, config);
  });

  const start = async (seed: number) => {
    const r = await ingest({ fileName: 'menu.pdf', bytes: pdf(seed), retryOf: null }, ctx);
    if (!r.ok) throw new Error(r.error.code);
    return r.value.followUp;
  };

  const usedTokens = async () => {
    const r = await list({}, ctx);
    if (!r.ok) throw new Error('list failed');
    return r.value;
  };

  it('deletes a ready row: gone from the list and from the token total, AiUsage kept', async () => {
    const keep = await start(1);
    const gone = await start(2);
    extractor.tokenCounter = () => 700;
    extractor.enqueueText('=== หน้า 1 ===\nก', {}).enqueueText('=== หน้า 1 ===\nข', {});
    await extract(keep);
    await extract(gone);
    expect((await usedTokens()).usedTokens).toBe(1400);

    expect(await del({ documentId: gone.documentId }, ctx)).toEqual({ ok: true, value: undefined });

    const after = await usedTokens();
    expect(after.documents.map((d) => d.id)).toEqual([keep.documentId]);
    expect(after.usedTokens).toBe(700);
    expect(usage.records.filter((u) => u.documentId === gone.documentId)).toHaveLength(1);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        event: 'knowledge.document.deleted',
        documentId: gone.documentId,
        requestId: ctx.requestId,
      }),
    );
  });

  it('lets the same file be uploaded again after delete', async () => {
    const first = await start(3);
    expect(await del({ documentId: first.documentId }, ctx)).toMatchObject({ ok: true });
    await expect(start(3)).resolves.toMatchObject({ bytes: pdf(3) });
  });

  it('deletes a processing row; phase B then ends without error', async () => {
    const followUp = await start(4);
    expect(await del({ documentId: followUp.documentId }, ctx)).toMatchObject({ ok: true });

    extractor.enqueueText('=== หน้า 1 ===\nก');
    await expect(extract(followUp)).resolves.toBeUndefined();
    expect(await knowledge.findById(followUp.documentId)).toBeNull();
    expect((await usedTokens()).usedTokens).toBe(0);
  });

  it('returns knowledge.not_found for a missing row', async () => {
    const followUp = await start(5);
    await del({ documentId: followUp.documentId }, ctx);
    const r = await del({ documentId: followUp.documentId }, ctx);
    expect(r.ok ? null : r.error.code).toBe('knowledge.not_found');
    expect(logger.eventsOf().filter((e) => e === 'knowledge.document.deleted')).toHaveLength(1);
  });
});
