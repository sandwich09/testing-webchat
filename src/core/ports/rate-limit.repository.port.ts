export interface RateLimitRepository {
  /**
   * Atomic: one row per key. If the row's windowStart is older than the given value, sets
   * count = 1 and the new windowStart. Otherwise count + 1. Returns the count after the increment.
   */
  hit(key: string, windowStart: Date): Promise<{ count: number }>;
  /** Read only: the count of this window. No row, or a row of an older window, gives 0. */
  peek(key: string, windowStart: Date): Promise<{ count: number }>;
}
