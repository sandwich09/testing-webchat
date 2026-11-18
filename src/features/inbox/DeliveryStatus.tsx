import { AlertCircle, Check } from 'lucide-react';

import { testIds } from '@/common/test-ids';
import { copy } from '@/features/inbox/inbox.constants';
import type { ThreadMessage } from '@/features/inbox/inbox.logic';
import { retryPlan, outgoingStatus } from '@/features/inbox/inbox.send.logic';
import { failedLineText } from '@/features/inbox/inbox.thread.logic';

type DeliveryStatusProps = {
  message: ThreadMessage;
  /**
   * `meta`: the "sent" check that goes before the time beside the last bubble of a group.
   * `below`: "sending" or the failed line with the retry button, under the bubble.
   */
  part: 'meta' | 'below';
  onRetry: (messageId: string) => void;
};

/** Delivery state of an outbound message (ui-screens 5.3, 7.5). Renders nothing for inbound rows. */
export function DeliveryStatus({ message, part, onRetry }: DeliveryStatusProps) {
  if (message.direction !== 'outbound') return null;
  const { status, code } = outgoingStatus(message);

  if (part === 'meta') {
    if (status !== 'sent') return null;
    return (
      <span data-testid={testIds.messageStatus} data-status="sent" title={copy.message.sent}>
        <Check aria-hidden="true" className="size-3" />
        <span className="sr-only">{copy.message.sent}</span>
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <p data-testid={testIds.messageStatus} data-status="pending" className="text-meta text-muted">
        {copy.message.sending}
      </p>
    );
  }

  if (status === 'failed') {
    const canRetry = retryPlan(message) !== null;
    return (
      // Outbound bubbles sit on the right, so the failed line and its button line up under them.
      <div className="flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-sub text-danger">
        <p
          data-testid={testIds.messageError}
          data-code={code ?? undefined}
          className="flex items-start gap-1.5"
        >
          <AlertCircle aria-hidden="true" className="mt-[3px] size-4 shrink-0" />
          <span className="[overflow-wrap:anywhere]">{failedLineText(code)}</span>
        </p>
        {canRetry ? (
          <button
            type="button"
            data-testid={testIds.messageRetry}
            onClick={() => {
              onRetry(message.id);
            }}
            className="inline-flex h-11 items-center rounded-full px-1 text-sub font-bold text-fg underline underline-offset-2 hover:bg-selected medium:h-8"
          >
            {copy.message.retry}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
