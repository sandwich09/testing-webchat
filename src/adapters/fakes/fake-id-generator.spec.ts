import { describe, expect, it } from 'vitest';
import { FakeClock } from './fake-clock';
import { FakeIdGenerator } from './fake-id-generator';
import { describeIdGeneratorSuite } from './suites/id-generator.suite';

describeIdGeneratorSuite(() => new FakeIdGenerator());

describe('FakeIdGenerator with a clock', () => {
  it('puts the clock time in the id and still sorts in call order', () => {
    const clock = new FakeClock(new Date('2026-11-18T00:00:00Z'));
    const generator = new FakeIdGenerator(clock);
    const a = generator.messageId();
    const b = generator.messageId();
    clock.advance(1000);
    const c = generator.messageId();
    const timeHex = a.replace(/-/g, '').slice(0, 12);
    expect(parseInt(timeHex, 16)).toBe(Date.parse('2026-11-18T00:00:00Z'));
    expect(a < b && b < c).toBe(true);
  });
});
