import { afterAll } from 'vitest';
import { describeCannedReplyRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createCannedReplyRepository } from './canned-reply.repository';
import { getPrismaClient } from './prisma-client';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeCannedReplyRepositorySuite(async () => {
  await client.cannedReply.deleteMany();
  return createCannedReplyRepository(client);
});
