import { afterAll } from 'vitest';
import { describeMessageRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createContactRepository } from './contact.repository';
import { createMessageRepository } from './message.repository';
import { getPrismaClient } from './prisma-client';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(async () => {
  await client.$disconnect();
});

describeMessageRepositorySuite(async () => {
  // Message, Contact and AiUsage (which references both), so each test starts from empty tables.
  await client.$executeRaw`TRUNCATE TABLE "AiUsage", "Message", "ContactNote", "Contact"`;
  return { messages: createMessageRepository(client), contacts: createContactRepository(client) };
});
