// Typing ping of the composer (ui-screens 5.8): ask LINE to show "loading" to the customer while
// the admin types, at most once per `TYPING_PING_INTERVAL_MS`. The throttle is plain code with an
// injected clock and send, so it is tested without React; `useTypingPing` in
// `inbox.composer.hooks.ts` wires it to a chat.
import { shouldSendTypingPing } from '../inbox.logic';

export type TypingPinger = {
  /** Call with every new value of the text box. Never throws and never waits. */
  onInput(value: string): void;
};

/**
 * A throttle around `send`: the first non-blank input pings, later inputs ping again only once
 * `intervalMs` has passed since the last ping. The result of `send` is ignored, a rejected promise
 * included: a failed ping is not a failure (webchat-inbox, composer item 9).
 */
export function createTypingPinger(deps: {
  intervalMs: number;
  now: () => number;
  send: () => Promise<unknown>;
}): TypingPinger {
  let lastSentAt: number | null = null;
  return {
    onInput(value) {
      if (value.trim() === '') return;
      const nowMs = deps.now();
      if (!shouldSendTypingPing(lastSentAt, nowMs, deps.intervalMs)) return;
      lastSentAt = nowMs;
      try {
        deps.send().catch(() => undefined);
      } catch {
        // A synchronous throw is ignored as well: typing must never break.
      }
    },
  };
}
