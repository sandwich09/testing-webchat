import { describe, expect, it } from 'vitest';
import { describeClockSuite } from '@/adapters/fakes';
import { createSystemClock } from './system-clock.adapter';

describeClockSuite(() => createSystemClock());

describe('createSystemClock', () => {
  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY])('sleep(%s) resolves at once', async (ms) => {
    await expect(createSystemClock().sleep(ms)).resolves.toBeUndefined();
  });
});
