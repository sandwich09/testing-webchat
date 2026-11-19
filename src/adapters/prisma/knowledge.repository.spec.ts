import { afterAll } from 'vitest';
import { describeKnowledgeRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createKnowledgeRepository } from './knowledge.repository';
import { getPrismaClient } from './prisma-client';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeKnowledgeRepositorySuite(async () => {
  await client.kbDocument.deleteMany();
  return createKnowledgeRepository(client);
});
