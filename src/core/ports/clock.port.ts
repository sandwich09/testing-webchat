/** A one-shot timer from `Clock.startTimer`. */
export interface ClockTimer {
  /** Resolves once the time has passed; never resolves after `cancel`. */
  fired: Promise<void>;
  /** Stops the timer. Safe to call more than once, and after it fired. */
  cancel(): void;
}

export interface Clock {
  now(): Date;
  /** The fake advances time at once without really waiting. */
  sleep(ms: number): Promise<void>;
  /**
   * A deadline a use case races its work against. The fake fires it only when its time is moved
   * past the deadline (`sleep`, `advance` or `set`), so work that never ends can be cut in a test.
   */
  startTimer(ms: number): ClockTimer;
}
