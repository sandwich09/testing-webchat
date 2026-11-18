import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCannedReplyRepository,
  FakeClock,
  FakeIdGenerator,
  FakeLogger,
} from '@/adapters/fakes';
import type { CannedReplyId } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeDeleteCannedReply } from './delete-canned-reply.use-case';
import { makeSaveCannedReply } from './save-canned-reply.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: null };

describe('DeleteCannedReply', () => {
  let repo: FakeCannedReplyRepository;
  let logger: FakeLogger;
  let remove: ReturnType<typeof makeDeleteCannedReply>;
  let save: ReturnType<typeof makeSaveCannedReply>;

  beforeEach(() => {
    const clock = new FakeClock();
    repo = new FakeCannedReplyRepository();
    logger = new FakeLogger(clock);
    remove = makeDeleteCannedReply({ cannedReplies: repo, logger }, config);
    save = makeSaveCannedReply(
      { cannedReplies: repo, ids: new FakeIdGenerator(clock), clock, logger },
      config,
    );
  });

  it('removes the reply so it is gone from the list', async () => {
    const created = await save({ id: null, title: 'A', text: 'a' }, ctx);
    if (!created.ok) throw new Error('create failed');

    const result = await remove({ id: created.value.id }, ctx);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.list()).toEqual([]);
    expect(logger.eventsOf()).toContain('canned_reply.item.deleted');
  });

  it('returns canned_reply.not_found for an id that does not exist', async () => {
    const result = await remove({ id: 'missing' as CannedReplyId }, ctx); // brand: test id

    expect(result.ok ? null : result.error.code).toBe('canned_reply.not_found');
    expect(logger.entries).toEqual([]);
  });
});
