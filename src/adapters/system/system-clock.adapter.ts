import { setTimeout as delay } from 'node:timers/promises';
import type { Clock, ClockTimer } from '@/core/ports';

const nonNegative = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? ms : 0);

export const createSystemClock = (): Clock => ({
  now: () => new Date(),
  async sleep(ms: number): Promise<void> {
    await delay(nonNegative(ms));
  },
  startTimer(ms: number): ClockTimer {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const fired = new Promise<void>((resolve) => {
      handle = setTimeout(resolve, nonNegative(ms));
    });
    return {
      fired,
      cancel: () => {
        clearTimeout(handle);
      },
    };
  },
});
