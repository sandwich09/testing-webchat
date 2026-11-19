import type { WebhookEventId } from '@/core/domain';

export interface WebhookEventRepository {
  has(id: WebhookEventId): Promise<boolean>;
  /** Insert-if-absent. true when this row was really added. */
  insertIfAbsent(e: {
    webhookEventId: WebhookEventId;
    type: string;
    receivedAt: Date;
  }): Promise<boolean>;
}
