import { beforeEach, describe, expect, it } from 'vitest';
import type { WebhookEventId } from '@/core/domain';
import type { WebhookEventRepository } from '@/core/ports';

const eventId = (s: string): WebhookEventId => `01JTEST${s}` as WebhookEventId; // brand: test id
const at = new Date('2026-11-18T03:00:00.000Z');

/**
 * Runs the WebhookEventRepository contract (docs/architecture/domain-and-ports.md) against the
 * subject. `makeSubject` runs before every test and must return a repository over an empty table.
 */
export const describeWebhookEventRepositorySuite = (
  makeSubject: () => WebhookEventRepository | Promise<WebhookEventRepository>,
): void => {
  describe('WebhookEventRepository contract', () => {
    let repo: WebhookEventRepository;

    beforeEach(async () => {
      repo = await makeSubject();
    });

    it('insertIfAbsent adds a new event once', async () => {
      expect(await repo.has(eventId('A'))).toBe(false);
      expect(
        await repo.insertIfAbsent({
          webhookEventId: eventId('A'),
          type: 'message',
          receivedAt: at,
        }),
      ).toBe(true);
      expect(await repo.has(eventId('A'))).toBe(true);
      expect(
        await repo.insertIfAbsent({
          webhookEventId: eventId('A'),
          type: 'message',
          receivedAt: at,
        }),
      ).toBe(false);
      expect(await repo.has(eventId('B'))).toBe(false);
    });

    it('gives true to one of several concurrent inserts of the same event', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          repo.insertIfAbsent({ webhookEventId: eventId('C'), type: 'follow', receivedAt: at }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });
};
