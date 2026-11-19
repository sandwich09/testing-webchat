import { describe, expect, it } from 'vitest';
import { describeIdGeneratorSuite } from '@/adapters/fakes';
import { createUuidV7IdGenerator } from './uuid-v7-id-generator.adapter';

describeIdGeneratorSuite(() => createUuidV7IdGenerator());

describe('createUuidV7IdGenerator', () => {
  it('ids made within one millisecond still sort in call order', () => {
    const generator = createUuidV7IdGenerator();
    const ids = Array.from({ length: 1000 }, () => generator.messageId());
    expect([...ids].sort()).toEqual(ids);
  });

  it('randomToken is 22 characters of [A-Za-z0-9_-]', () => {
    const generator = createUuidV7IdGenerator();
    for (let i = 0; i < 100; i += 1) expect(generator.randomToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('requestId is a UUID', () => {
    expect(createUuidV7IdGenerator().requestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
