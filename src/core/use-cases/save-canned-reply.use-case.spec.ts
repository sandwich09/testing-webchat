import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCannedReplyRepository,
  FakeClock,
  FakeIdGenerator,
  FakeLogger,
} from '@/adapters/fakes';
import type { CannedReplyId } from '@/core/domain';
import { CANNED_REPLY_MAX_COUNT, PRICE_TABLE } from '@/core/domain';
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

describe('SaveCannedReply', () => {
  let clock: FakeClock;
  let repo: FakeCannedReplyRepository;
  let logger: FakeLogger;
  let save: ReturnType<typeof makeSaveCannedReply>;

  beforeEach(() => {
    clock = new FakeClock();
    repo = new FakeCannedReplyRepository();
    logger = new FakeLogger(clock);
    save = makeSaveCannedReply(
      { cannedReplies: repo, ids: new FakeIdGenerator(clock), clock, logger },
      config,
    );
  });

  it('gives the first reply sortOrder 1 and the second sortOrder 2', async () => {
    const first = await save({ id: null, title: 'Hello', text: 'Hi there' }, ctx);
    const second = await save({ id: null, title: 'Bye', text: 'See you' }, ctx);

    expect(first.ok ? first.value.sortOrder : null).toBe(1);
    expect(second.ok ? second.value.sortOrder : null).toBe(2);
    expect(first.ok ? first.value.createdAt : null).toEqual(clock.now());
    expect(await repo.count()).toBe(2);
    expect(logger.eventsOf()).toEqual(['canned_reply.item.saved', 'canned_reply.item.saved']);
  });

  it('refuses a new reply at CANNED_REPLY_MAX_COUNT with canned_reply.limit_reached', async () => {
    for (let i = 0; i < CANNED_REPLY_MAX_COUNT; i += 1) {
      await save({ id: null, title: `t${String(i)}`, text: 'x' }, ctx);
    }

    const result = await save({ id: null, title: 'one more', text: 'x' }, ctx);

    expect(result.ok ? null : result.error.code).toBe('canned_reply.limit_reached');
    expect(await repo.count()).toBe(CANNED_REPLY_MAX_COUNT);
  });

  it('changes only the title and leaves the text alone', async () => {
    const created = await save({ id: null, title: 'Old', text: 'Body' }, ctx);
    if (!created.ok) throw new Error('create failed');
    clock.advance(1000);

    const result = await save({ id: created.value.id, title: 'New' }, ctx);

    expect(result.ok ? result.value : null).toEqual({
      ...created.value,
      title: 'New',
      updatedAt: clock.now(),
    });
  });

  it('changes sortOrder', async () => {
    const created = await save({ id: null, title: 'A', text: 'a' }, ctx);
    if (!created.ok) throw new Error('create failed');

    const result = await save({ id: created.value.id, sortOrder: 9 }, ctx);

    expect(result.ok ? result.value.sortOrder : null).toBe(9);
  });

  it('returns canned_reply.not_found for an id that does not exist', async () => {
    const result = await save({ id: 'missing' as CannedReplyId, title: 'x' }, ctx); // brand: test id

    expect(result.ok ? null : result.error.code).toBe('canned_reply.not_found');
    expect(logger.entries).toEqual([]);
  });
});
