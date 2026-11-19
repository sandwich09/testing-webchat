import type { WebhookEventId } from '@/core/domain';
import type { WebhookEventRepository } from '@/core/ports';

/** In-memory WebhookEventRepository. `webhookEventId` is unique; the insert skips duplicates. */
export class FakeWebhookEventRepository implements WebhookEventRepository {
  private readonly rows = new Map<WebhookEventId, { type: string; receivedAt: Date }>();

  readonly has: WebhookEventRepository['has'] = (id) => Promise.resolve(this.rows.has(id));

  readonly insertIfAbsent: WebhookEventRepository['insertIfAbsent'] = (e) => {
    if (this.rows.has(e.webhookEventId)) return Promise.resolve(false);
    this.rows.set(e.webhookEventId, { type: e.type, receivedAt: e.receivedAt });
    return Promise.resolve(true);
  };
}
