import type { RateLimitRepository } from '@/core/ports';

/** In-memory RateLimitRepository: one fixed-window bucket per key, like `RateLimitBucket`. */
export class FakeRateLimitRepository implements RateLimitRepository {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();

  readonly hit: RateLimitRepository['hit'] = (key, windowStart) => {
    const ws = windowStart.getTime();
    const row = this.buckets.get(key);
    if (!row || row.windowStart < ws) {
      this.buckets.set(key, { windowStart: ws, count: 1 });
      return Promise.resolve({ count: 1 });
    }
    // Same window, or a caller with an older window: count on, keep the newer windowStart
    // (GREATEST in the SQL upsert).
    row.count += 1;
    return Promise.resolve({ count: row.count });
  };

  readonly refund: RateLimitRepository['refund'] = (key, windowStart) => {
    const row = this.buckets.get(key);
    if (row?.windowStart === windowStart.getTime() && row.count > 0) row.count -= 1;
    return Promise.resolve();
  };
}
