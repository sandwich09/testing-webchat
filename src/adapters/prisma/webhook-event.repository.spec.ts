import { afterAll } from 'vitest';
import { describeWebhookEventRepositorySuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { getPrismaClient } from './prisma-client';
import { createWebhookEventRepository } from './webhook-event.repository';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeWebhookEventRepositorySuite(async () => {
  await client.webhookEvent.deleteMany();
  return createWebhookEventRepository(client);
});
