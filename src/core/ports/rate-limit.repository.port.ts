export interface RateLimitRepository {
  /**
   * Atomic: one row per key. If the row's windowStart is older than the given value, sets
   * count = 1 and the new windowStart. Otherwise count + 1. Returns the count after the increment.
   */
  hit(key: string, windowStart: Date): Promise<{ count: number }>;
  /**
   * Atomic: takes back one hit of this window (count - 1, never below 0). No row, or a row of
   * another window, is left as it is.
   */
  refund(key: string, windowStart: Date): Promise<void>;
}
