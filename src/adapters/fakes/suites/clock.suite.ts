import { describe, expect, it } from 'vitest';
import type { Clock } from '@/core/ports';

/** Runs every row of the Clock contract in domain-and-ports against the subject. */
export const describeClockSuite = (makeSubject: () => Clock | Promise<Clock>): void => {
  describe('Clock', () => {
    it('now returns a valid Date', async () => {
      const clock = await makeSubject();
      const now = clock.now();
      expect(now).toBeInstanceOf(Date);
      expect(Number.isNaN(now.getTime())).toBe(false);
    });

    it('now returns a new Date each call, so changing one does not move the clock', async () => {
      const clock = await makeSubject();
      const first = clock.now();
      const before = first.getTime();
      first.setTime(0);
      expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);
    });

    it('now never goes backwards', async () => {
      const clock = await makeSubject();
      const a = clock.now().getTime();
      const b = clock.now().getTime();
      expect(b).toBeGreaterThanOrEqual(a);
    });

    it('sleep resolves, and afterwards now has moved forward by the time slept', async () => {
      const clock = await makeSubject();
      const before = clock.now().getTime();
      await clock.sleep(30);
      // A real timer may fire a millisecond or two early.
      expect(clock.now().getTime() - before).toBeGreaterThanOrEqual(28);
    });

    it('sleep(0) resolves', async () => {
      const clock = await makeSubject();
      await expect(clock.sleep(0)).resolves.toBeUndefined();
    });

    it('a timer fires once its time has passed', async () => {
      const clock = await makeSubject();
      const timer = clock.startTimer(20);
      await clock.sleep(40);
      await expect(timer.fired).resolves.toBeUndefined();
      timer.cancel(); // after it fired: no effect, no throw
    });

    it('a cancelled timer never fires', async () => {
      const clock = await makeSubject();
      let fired = false;
      const timer = clock.startTimer(20);
      void timer.fired.then(() => {
        fired = true;
      });
      timer.cancel();
      timer.cancel();
      await clock.sleep(40);
      await Promise.resolve();
      expect(fired).toBe(false);
    });

    it('a timer does not fire before its time', async () => {
      const clock = await makeSubject();
      let fired = false;
      const timer = clock.startTimer(60_000);
      void timer.fired.then(() => {
        fired = true;
      });
      await clock.sleep(10);
      await Promise.resolve();
      expect(fired).toBe(false);
      timer.cancel();
    });
  });
};
