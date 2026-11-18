import { setTimeout as delay } from 'node:timers/promises';
import type { Clock } from '@/core/ports';

export const createSystemClock = (): Clock => ({
  now: () => new Date(),
  async sleep(ms: number): Promise<void> {
    await delay(Number.isFinite(ms) && ms > 0 ? ms : 0);
  },
});
