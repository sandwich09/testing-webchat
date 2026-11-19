import type { Clock } from '@/core/ports';

/** Manual clock. `sleep` moves time forward at once and never waits. */
export class FakeClock implements Clock {
  /** Every `sleep` duration, in call order. */
  readonly sleeps: number[] = [];
  private current: number;

  constructor(start: Date = new Date('2026-11-18T00:00:00Z')) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.advance(ms);
    return Promise.resolve();
  }

  advance(ms: number): void {
    this.current += Math.max(0, ms);
  }

  set(time: Date): void {
    this.current = time.getTime();
  }
}
