import { afterAll, describe, expect, it } from 'vitest';
import { describeRateLimitRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { getPrismaClient } from './prisma-client';
import { createRateLimitRepository } from './rate-limit.repository';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeRateLimitRepositorySuite(async () => {
  await client.rateLimitBucket.deleteMany();
  return createRateLimitRepository(client);
});

describe('createRateLimitRepository (Postgres)', () => {
  it('deletes buckets older than a day when a new window starts', async () => {
    await client.rateLimitBucket.deleteMany();
    const repo = createRateLimitRepository(client);
    await repo.hit('old:ip', new Date('2026-11-16T03:00:00.000Z'));
    await repo.hit('recent:ip', new Date('2026-11-18T02:30:00.000Z'));
    await repo.hit('new:ip', new Date('2026-11-18T03:00:00.000Z'));
    const keys = (await client.rateLimitBucket.findMany()).map((b) => b.key).sort();
    expect(keys).toEqual(['new:ip', 'recent:ip']);
  });
});
