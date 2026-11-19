import { describe, expect, it } from 'vitest';
import { FakeClock } from './fake-clock';
import { describeClockSuite } from './suites/clock.suite';

describeClockSuite(() => new FakeClock());

describe('FakeClock test controls', () => {
  it('sleep moves time forward at once without waiting', async () => {
    const clock = new FakeClock(new Date('2026-11-18T00:00:00Z'));
    const realStart = performance.now();
    await clock.sleep(3_600_000);
    expect(performance.now() - realStart).toBeLessThan(500);
    expect(clock.now().toISOString()).toBe('2026-11-18T01:00:00.000Z');
    expect(clock.sleeps).toEqual([3_600_000]);
  });

  it('advance and set move the time', () => {
    const clock = new FakeClock(new Date('2026-11-18T00:00:00Z'));
    clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-11-18T00:00:01.500Z');
    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('fires a timer only when advance or set moves the time to it', async () => {
    const clock = new FakeClock(new Date('2026-11-18T00:00:00Z'));
    const fired: string[] = [];
    const a = clock.startTimer(1000);
    const b = clock.startTimer(5000);
    void a.fired.then(() => fired.push('a'));
    void b.fired.then(() => fired.push('b'));
    clock.advance(999);
    await Promise.resolve();
    expect(fired).toEqual([]);
    clock.advance(1);
    await Promise.resolve();
    expect(fired).toEqual(['a']);
    clock.set(new Date('2026-11-18T00:00:05Z'));
    await Promise.resolve();
    expect(fired).toEqual(['a', 'b']);
    expect(clock.pendingTimers).toBe(0);
  });

  it('does not run backwards for a negative sleep', async () => {
    const clock = new FakeClock(new Date('2026-11-18T00:00:00Z'));
    await clock.sleep(-5);
    expect(clock.now().toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });
});
