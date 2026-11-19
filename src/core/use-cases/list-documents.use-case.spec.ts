import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentId } from '@/core/domain';
import { KNOWLEDGE_CAPACITY_TOKENS, KNOWLEDGE_STUCK_AFTER_MS } from '@/core/domain';
import { FakeClock, FakeKnowledgeRepository, FakeLogger } from '@/adapters/fakes';
import { makeListDocuments } from './list-documents.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const ctx: RequestContext = { requestId: 'req-test', clientIp: null };
const docId = (n: number) => `0190f000-0000-7000-8000-${String(n).padStart(12, '0')}` as DocumentId; // brand: test id

describe('ListDocuments', () => {
  let clock: FakeClock;
  let knowledge: FakeKnowledgeRepository;
  let logger: FakeLogger;
  let list: ReturnType<typeof makeListDocuments>;

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    knowledge = new FakeKnowledgeRepository();
    logger = new FakeLogger(clock);
    list = makeListDocuments({ knowledge, clock, logger }, {} as UseCaseConfig); // brand: config unused
  });

  const add = async (n: number) => {
    clock.advance(1000);
    await knowledge.create({
      id: docId(n),
      fileName: `f${String(n)}.pdf`,
      sizeBytes: 10,
      sha256: String(n).padStart(64, '0'),
      now: clock.now(),
    });
    return docId(n);
  };

  it('returns an empty library with the capacity', async () => {
    expect(await list({}, ctx)).toEqual({
      ok: true,
      value: { documents: [], usedTokens: 0, capacityTokens: KNOWLEDGE_CAPACITY_TOKENS },
    });
  });

  it('counts usedTokens from ready rows only, lists newest first and never returns the text', async () => {
    const ready = await add(1);
    const failed = await add(2);
    const processing = await add(3);
    await knowledge.markReady(ready, {
      text: 'ข้อความเมนู',
      pageCount: 2,
      tokenCount: 1200,
      now: clock.now(),
    });
    await knowledge.markFailed(failed, {
      code: 'knowledge.capacity_exceeded',
      pageCount: 1,
      tokenCount: 900,
      now: clock.now(),
    });

    const r = await list({}, ctx);
    if (!r.ok) throw new Error('list failed');
    expect(r.value.usedTokens).toBe(1200);
    expect(r.value.capacityTokens).toBe(KNOWLEDGE_CAPACITY_TOKENS);
    expect(r.value.documents.map((d) => [d.id, d.status])).toEqual([
      [processing, 'processing'],
      [failed, 'failed'],
      [ready, 'ready'],
    ]);
    for (const d of r.value.documents) expect(d).not.toHaveProperty('extractedText');
    expect(JSON.stringify(r.value)).not.toContain('ข้อความเมนู');
  });

  describe('stuck extraction recovery', () => {
    it('fails a document processing longer than KNOWLEDGE_STUCK_AFTER_MS with knowledge.extract_interrupted', async () => {
      const stuck = await add(1);
      clock.advance(KNOWLEDGE_STUCK_AFTER_MS);
      const fresh = await add(2);
      clock.advance(1);

      const r = await list({}, ctx);
      if (!r.ok) throw new Error('list failed');
      expect(r.value.documents.map((d) => [d.id, d.status, d.error])).toEqual([
        [fresh, 'processing', null],
        [stuck, 'failed', 'knowledge.extract_interrupted'],
      ]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'knowledge.ingest.stuck_recovered',
          level: 'warn',
          count: 1,
        }),
      );
    });

    it('leaves a document younger than the bound and logs nothing when nothing is stuck', async () => {
      const doc = await add(1);
      clock.advance(KNOWLEDGE_STUCK_AFTER_MS - 1000);

      const r = await list({}, ctx);
      expect(r.ok && r.value.documents[0]).toMatchObject({ id: doc, status: 'processing' });
      expect(logger.eventsOf()).toEqual([]);
    });

    it('recovers a stuck document for one of two concurrent lists only', async () => {
      await add(1);
      clock.advance(KNOWLEDGE_STUCK_AFTER_MS + 1);

      await Promise.all([list({}, ctx), list({}, ctx)]);
      expect(logger.eventsOf()).toEqual(['knowledge.ingest.stuck_recovered']);
    });
  });
});
