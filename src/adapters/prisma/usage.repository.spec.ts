import { afterAll } from 'vitest';
import { describeUsageRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createContactRepository } from './contact.repository';
import { getPrismaClient } from './prisma-client';
import { createUsageRepository } from './usage.repository';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeUsageRepositorySuite(async () => {
  // AiUsage references Contact and Message, so all three start empty.
  await client.$executeRaw`TRUNCATE TABLE "AiUsage", "Message", "Contact"`;
  return { usage: createUsageRepository(client), contacts: createContactRepository(client) };
});
