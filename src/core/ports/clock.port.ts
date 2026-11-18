export interface Clock {
  now(): Date;
  /** The fake advances time at once without really waiting. */
  sleep(ms: number): Promise<void>;
}
