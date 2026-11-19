import type { Clock, ClockTimer } from '@/core/ports';

interface PendingTimer {
  at: number;
  resolve: () => void;
}

/**
 * Manual clock. `sleep` moves time forward at once and never waits. A timer fires only when the
 * time is moved to or past it (`sleep`, `advance` or `set`).
 */
export class FakeClock implements Clock {
  /** Every `sleep` duration, in call order. */
  readonly sleeps: number[] = [];
  private current: number;
  private timers: PendingTimer[] = [];

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

  startTimer(ms: number): ClockTimer {
    let timer: PendingTimer | undefined;
    const fired = new Promise<void>((resolve) => {
      timer = { at: this.current + Math.max(0, ms), resolve };
    });
    const pending = timer as PendingTimer; // assigned synchronously by the executor above
    this.timers.push(pending);
    this.fireDue();
    return {
      fired,
      cancel: () => {
        this.timers = this.timers.filter((t) => t !== pending);
      },
    };
  }

  /** Timers started and neither fired nor cancelled. */
  get pendingTimers(): number {
    return this.timers.length;
  }

  advance(ms: number): void {
    this.current += Math.max(0, ms);
    this.fireDue();
  }

  set(time: Date): void {
    this.current = time.getTime();
    this.fireDue();
  }

  private fireDue(): void {
    const due = this.timers.filter((t) => t.at <= this.current);
    if (due.length === 0) return;
    this.timers = this.timers.filter((t) => t.at > this.current);
    for (const t of due) t.resolve();
  }
}
