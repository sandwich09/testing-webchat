import { ContactAvatar } from '@/common/ContactAvatar';
import { AVATAR_GROUP } from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import type { ThreadMessage } from '@/features/inbox/inbox.logic';
import { MessageBubble } from '@/features/inbox/thread/MessageBubble';

type MessageGroupProps = {
  author: 'customer' | 'admin' | 'ai';
  messages: readonly ThreadMessage[];
  /** The customer, for the picture and name beside their messages. */
  customer: { id: string; name: string; pictureUrl: string | null };
  onRetry: (messageId: string) => void;
  onOpenMedia: (message: ThreadMessage, trigger: HTMLElement) => void;
};

/**
 * Messages of one sender close in time (ui-screens 5.3). Customer groups have the picture beside
 * the last bubble and the name above the first; store groups sit on the right with no picture.
 */
export function MessageGroup({
  author,
  messages,
  customer,
  onRetry,
  onOpenMedia,
}: MessageGroupProps) {
  const isCustomer = author === 'customer';
  const bubbles = (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
      {isCustomer ? (
        <p className="truncate py-0.5 text-meta leading-normal text-muted">{customer.name}</p>
      ) : null}
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          side={isCustomer ? 'customer' : 'store'}
          isLast={index === messages.length - 1}
          onRetry={onRetry}
          onOpenMedia={onOpenMedia}
        />
      ))}
    </div>
  );

  return (
    <div
      data-testid={testIds.messageGroup}
      data-author={author}
      className="mb-3.5 flex items-end gap-2"
    >
      {isCustomer ? (
        <ContactAvatar
          name={customer.name}
          pictureUrl={customer.pictureUrl}
          contactId={customer.id}
          size={AVATAR_GROUP}
        />
      ) : null}
      {bubbles}
    </div>
  );
}
