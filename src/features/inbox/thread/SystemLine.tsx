import { eventCodeText } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import type { ThreadMessage } from '@/features/inbox/inbox.logic';

/**
 * Event line in the thread (ui-screens 5.3): "AI stopped, waiting for an admin", "customer
 * unfollowed" and so on. It sits at the time of the event. A code the screen does not know shows
 * nothing.
 */
export function SystemLine({ message }: { message: ThreadMessage }) {
  const text = message.eventCode === null ? null : eventCodeText(message.eventCode);
  if (text === null) return null;
  return (
    <p
      data-testid={testIds.systemLine}
      data-message-id={message.id}
      data-event-code={message.eventCode}
      className="my-3 px-2 py-0.5 text-center text-sub [overflow-wrap:anywhere] text-muted"
    >
      {text}
    </p>
  );
}
