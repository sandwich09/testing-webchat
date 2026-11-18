import { randomUUID } from 'node:crypto';
import type { WebhookEventRepository } from '@/core/ports';
import type { PrismaClient } from './prisma-client';

export function createWebhookEventRepository(client: PrismaClient): WebhookEventRepository {
  return {
    async has(id) {
      const row = await client.webhookEvent.findUnique({
        where: { webhookEventId: id },
        select: { id: true },
      });
      return row !== null;
    },

    async insertIfAbsent(e) {
      // INSERT ... ON CONFLICT DO NOTHING; count 0 means another call already stored the event.
      const { count } = await client.webhookEvent.createMany({
        data: [
          {
            id: randomUUID(), // the port has no id parameter and IdGenerator has no webhook-event id
            webhookEventId: e.webhookEventId,
            type: e.type,
            receivedAt: e.receivedAt,
          },
        ],
        skipDuplicates: true,
      });
      return count === 1;
    },
  };
}
