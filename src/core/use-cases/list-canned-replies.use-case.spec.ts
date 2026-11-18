import { beforeEach, describe, expect, it } from 'vitest';
import { FakeCannedReplyRepository, FakeClock, FakeIdGenerator } from '@/adapters/fakes';
import type { CannedReply } from '@/core/domain';
import { PRICE_TABLE } from '@/core/domain';
import { makeListCannedReplies } from './list-canned-replies.use-case';
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

describe('ListCannedReplies', () => {
  let repo: FakeCannedReplyRepository;
  let ids: FakeIdGenerator;
  let clock: FakeClock;
  let list: ReturnType<typeof makeListCannedReplies>;

  const reply = (title: string, sortOrder: number): CannedReply => ({
    id: ids.cannedReplyId(),
    title,
    text: title,
    sortOrder,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });

  beforeEach(() => {
    clock = new FakeClock();
    ids = new FakeIdGenerator(clock);
    repo = new FakeCannedReplyRepository();
    list = makeListCannedReplies({ cannedReplies: repo }, config);
  });

  it('returns an empty list when there are no replies', async () => {
    expect(await list({}, ctx)).toEqual({ ok: true, value: [] });
  });

  it('returns the replies ordered by sortOrder', async () => {
    await repo.create(reply('second', 2));
    await repo.create(reply('first', 1));

    const result = await list({}, ctx);

    expect(result.ok ? result.value.map((c) => c.title) : null).toEqual(['first', 'second']);
  });
});
