import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TYPING_PING_INTERVAL_MS } from './inbox.constants';
import { createTypingPinger } from './inbox.typing';

describe('createTypingPinger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T03:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (send: () => Promise<unknown> = () => Promise.resolve({ shown: true })) => {
    const spy = vi.fn(send);
    const pinger = createTypingPinger({
      intervalMs: TYPING_PING_INTERVAL_MS,
      now: () => Date.now(),
      send: spy,
    });
    return { pinger, send: spy };
  };

  it('pings on the first keystroke and at most once per interval while typing', () => {
    const { pinger, send } = setup();
    pinger.onInput('ส');
    expect(send).toHaveBeenCalledTimes(1);

    // Typing continuously, one keystroke every 100 ms for just under one interval.
    for (let t = 100; t < TYPING_PING_INTERVAL_MS; t += 100) {
      vi.advanceTimersByTime(100);
      pinger.onInput('สวัสดี');
    }
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100); // exactly one interval after the first ping
    pinger.onInput('สวัสดีค่ะ');
    expect(send).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(TYPING_PING_INTERVAL_MS - 1);
    pinger.onInput('สวัสดีค่ะ ');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never sends more pings than elapsed intervals over a long session', () => {
    const { pinger, send } = setup();
    const total = TYPING_PING_INTERVAL_MS * 10;
    for (let t = 0; t <= total; t += 37) {
      pinger.onInput('x');
      vi.advanceTimersByTime(37);
    }
    expect(send.mock.calls.length).toBeLessThanOrEqual(total / TYPING_PING_INTERVAL_MS + 1);
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('does not ping for an empty or blank value', () => {
    const { pinger, send } = setup();
    pinger.onInput('');
    pinger.onInput('   \n');
    expect(send).not.toHaveBeenCalled();
    pinger.onInput(' a');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignores a failed ping and keeps the throttle', async () => {
    const { pinger, send } = setup(() => Promise.reject(new Error('offline')));
    expect(() => {
      pinger.onInput('a');
    }).not.toThrow();
    await vi.runAllTimersAsync(); // the rejection is handled, nothing is unhandled
    pinger.onInput('ab');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('ignores a send that throws synchronously', () => {
    const { pinger, send } = setup(() => {
      throw new Error('boom');
    });
    expect(() => {
      pinger.onInput('a');
    }).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh throttle for each pinger (a new chat)', () => {
    const first = setup();
    first.pinger.onInput('a');
    const second = setup();
    second.pinger.onInput('a');
    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).toHaveBeenCalledTimes(1);
  });
});
