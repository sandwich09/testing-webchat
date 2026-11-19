import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentId } from '@/core/domain';
import { FakeClock, FakeKnowledgeRepository } from '@/adapters/fakes';
import { makeGetDocument } from './get-document.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const ctx: RequestContext = { requestId: 'req-test', clientIp: null };
const DOC = '0190f000-0000-7000-8000-000000000001' as DocumentId; // brand: test id

describe('GetDocument', () => {
  let clock: FakeClock;
  let knowledge: FakeKnowledgeRepository;
  let get: ReturnType<typeof makeGetDocument>;

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    knowledge = new FakeKnowledgeRepository();
    get = makeGetDocument({ knowledge }, {} as UseCaseConfig); // brand: config unused
  });

  it('returns the row with its extracted text', async () => {
    await knowledge.create({
      id: DOC,
      fileName: 'menu.pdf',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
      now: clock.now(),
    });
    await knowledge.markReady(DOC, {
      text: '=== หน้า 1 ===\nเมนู',
      pageCount: 1,
      tokenCount: 8,
      now: clock.now(),
    });

    expect(await get({ documentId: DOC }, ctx)).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: DOC,
        status: 'ready',
        pageCount: 1,
        tokenCount: 8,
        extractedText: '=== หน้า 1 ===\nเมนู',
      }) as unknown,
    });
  });

  it('returns extractedText null while processing', async () => {
    await knowledge.create({
      id: DOC,
      fileName: 'menu.pdf',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
      now: clock.now(),
    });
    const r = await get({ documentId: DOC }, ctx);
    expect(r.ok ? r.value : null).toMatchObject({ status: 'processing', extractedText: null });
  });

  it('returns knowledge.not_found for a missing row', async () => {
    const r = await get({ documentId: DOC }, ctx);
    expect(r.ok ? null : r.error.code).toBe('knowledge.not_found');
  });
});
