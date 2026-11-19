import { afterAll } from 'vitest';
import { describeContactNoteRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createContactNoteRepository } from './contact-note.repository';
import { createContactRepository } from './contact.repository';
import { getPrismaClient } from './prisma-client';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeContactNoteRepositorySuite(async () => {
  await client.$executeRaw`TRUNCATE TABLE "AiUsage", "Message", "ContactNote", "Contact"`;
  return {
    notes: createContactNoteRepository(client),
    contacts: createContactRepository(client),
  };
});
