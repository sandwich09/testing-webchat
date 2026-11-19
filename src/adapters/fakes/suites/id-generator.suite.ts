import { describe, expect, it } from 'vitest';
import type { IdGenerator } from '@/core/ports';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const uuidMakers: [string, (g: IdGenerator) => string][] = [
  ['contactId', (g) => g.contactId()],
  ['messageId', (g) => g.messageId()],
  ['documentId', (g) => g.documentId()],
  ['usageId', (g) => g.usageId()],
];

/** Runs every row of the IdGenerator contract in domain-and-ports against the subject. */
export const describeIdGeneratorSuite = (
  makeSubject: () => IdGenerator | Promise<IdGenerator>,
): void => {
  describe('IdGenerator', () => {
    it.each(uuidMakers)('%s is a lowercase UUIDv7', async (_name, make) => {
      const generator = await makeSubject();
      expect(make(generator)).toMatch(UUID_V7);
    });

    it.each(uuidMakers)('%s is unique across many calls', async (_name, make) => {
      const generator = await makeSubject();
      const ids = new Set(Array.from({ length: 500 }, () => make(generator)));
      expect(ids.size).toBe(500);
    });

    it('the five id kinds never collide with each other', async () => {
      const generator = await makeSubject();
      const ids = uuidMakers.flatMap(([, make]) =>
        Array.from({ length: 20 }, () => make(generator)),
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('ids sort by creation time', async () => {
      const generator = await makeSubject();
      const first = generator.contactId();
      await wait(5);
      const second = generator.contactId();
      await wait(5);
      const third = generator.contactId();
      expect([first, second, third]).toEqual([first, second, third].sort());
      expect(first < second && second < third).toBe(true);
    });

    it('requestId is a non-empty single-token string and unique', async () => {
      const generator = await makeSubject();
      const ids = Array.from({ length: 200 }, () => generator.requestId());
      for (const id of ids) expect(id).toMatch(/^\S+$/);
      expect(new Set(ids).size).toBe(200);
    });

    it('randomToken is 128 bits as 22 base64url characters and unique', async () => {
      const generator = await makeSubject();
      const tokens = Array.from({ length: 500 }, () => generator.randomToken());
      for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(new Set(tokens).size).toBe(500);
    });
  });
};
