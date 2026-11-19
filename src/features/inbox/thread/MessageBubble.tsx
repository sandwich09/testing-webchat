'use client';

import { Fragment, memo, useState, type CSSProperties } from 'react';

import { cn, formatMessageTime } from '@/common/common.logic';
import {
  BUBBLE_MAX_WIDTH,
  BUBBLE_MAX_WIDTH_NARROW,
  BUBBLE_RADIUS,
  BUBBLE_TAIL_RADIUS,
} from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import { copy } from '@/features/inbox/inbox.constants';
import { linkify, type ThreadMessage } from '@/features/inbox/inbox.logic';
import { outgoingStatus } from '@/features/inbox/inbox.send.logic';
import { DeliveryStatus } from '@/features/inbox/thread/DeliveryStatus';
import { quoteView, resolveMedia } from '@/features/inbox/thread/inbox.thread.logic';
import { MediaContent } from '@/features/inbox/thread/MediaContent';

type MessageBubbleProps = {
  message: ThreadMessage;
  /** `customer` bubbles sit on the left; `store` bubbles (admin and AI) on the right. */
  side: 'customer' | 'store';
  /** The last bubble of its group has the small corner, the time and the sender label. */
  isLast: boolean;
  onRetry: (messageId: string) => void;
  onOpenMedia: (message: ThreadMessage, trigger: HTMLElement) => void;
  /** The customer's name, for a quote of their own message. */
  customerName: string;
  /** Scrolls to and highlights a message when it is loaded; does nothing otherwise. */
  onJumpToMessage: (messageId: string) => void;
};

const WIDTH_VARS = {
  '--bubble-wide': BUBBLE_MAX_WIDTH,
  '--bubble-narrow': BUBBLE_MAX_WIDTH_NARROW,
} as CSSProperties; // CSS custom properties are not part of CSSProperties

function TextContent({ text }: { text: string }) {
  return (
    <p
      data-testid={testIds.messageText}
      className="px-3 py-2 text-body [overflow-wrap:anywhere] whitespace-pre-wrap"
    >
      {linkify(text).map((segment, index) =>
        segment.kind === 'link' ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </p>
  );
}

/**
 * The message a customer replied to with LINE's quote, above the text (ui-screens 5.3). A known
 * message is a button that jumps to it; an unknown one is muted text.
 */
function QuoteBlock({
  view,
  onJump,
}: {
  view: NonNullable<ReturnType<typeof quoteView>>;
  onJump: (messageId: string) => void;
}) {
  const inner = view.available ? (
    <>
      <span className="block truncate font-bold">{view.author}</span>
      <span className="block truncate">{view.text}</span>
    </>
  ) : (
    <span className="block truncate italic">{view.text}</span>
  );
  const className =
    'mx-2 mt-2 block w-[calc(100%-1rem)] min-w-0 rounded-md border-l-[3px] border-muted bg-chat px-2 py-1 text-left text-sub text-muted';
  if (view.available && view.messageId !== null) {
    const target = view.messageId;
    return (
      <button
        type="button"
        data-testid={testIds.messageQuote}
        data-available="true"
        data-quoted-id={target}
        aria-label={view.ariaLabel}
        title={copy.quote.jumpHint}
        className={cn(className, 'cursor-pointer hover:bg-selected')}
        onClick={() => {
          onJump(target);
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      data-testid={testIds.messageQuote}
      data-available={view.available ? 'true' : 'false'}
      aria-label={view.ariaLabel}
      role="note"
      className={className}
    >
      {inner}
    </div>
  );
}

/** One bubble with the time and sender beside it and the delivery state under it (ui-screens 5.3). */
function MessageBubbleBase({
  message,
  side,
  isLast,
  onRetry,
  onOpenMedia,
  customerName,
  onJumpToMessage,
}: MessageBubbleProps) {
  const quote = quoteView(message.quote, customerName);
  const [stickerFailed, setStickerFailed] = useState(false);
  const view = resolveMedia(message);
  const { status } = outgoingStatus(message);
  const isStore = side === 'store';

  // A sticker has no bubble. When its picture is missing or fails, it becomes a normal bubble
  // that says "sticker".
  const stickerWorks = view?.kind === 'sticker' && view.src !== null && !stickerFailed;
  const stickerFallback = view?.kind === 'sticker' && !stickerWorks;

  const style: CSSProperties = stickerWorks
    ? WIDTH_VARS
    : {
        ...WIDTH_VARS,
        borderRadius: BUBBLE_RADIUS,
        ...(isLast
          ? isStore
            ? { borderBottomRightRadius: BUBBLE_TAIL_RADIUS }
            : { borderBottomLeftRadius: BUBBLE_TAIL_RADIUS }
          : {}),
      };

  let content;
  if (view === null) {
    content = <TextContent text={message.text ?? ''} />;
  } else if (stickerFallback) {
    content = (
      <p data-testid={testIds.messageMedia} className="px-3 py-2 text-body">
        {copy.media.sticker}
      </p>
    );
  } else {
    content = (
      <MediaContent
        message={message}
        view={view}
        onOpen={onOpenMedia}
        onStickerError={() => {
          setStickerFailed(true);
        }}
      />
    );
  }

  const bubble = (
    <div
      data-testid={testIds.messageBubble}
      data-message-id={message.id}
      data-author={message.author}
      data-type={message.type}
      data-status={status}
      data-media-status={message.media?.status}
      style={style}
      className={cn(
        'max-w-(--bubble-narrow) min-w-0 overflow-hidden medium:max-w-(--bubble-wide)',
        // A quote jumped here (MessageList): a ring for QUOTE_HIGHLIGHT_MS, not colour alone
        // since the jump also moves the message into view and focus stays on the quote.
        'transition-shadow data-[highlight=true]:ring-2 data-[highlight=true]:ring-accent-strong',
        !stickerWorks && (isStore ? 'bg-bubble-out' : 'border border-line bg-surface'),
        status === 'pending' && 'opacity-[0.55]',
        status === 'failed' && 'ring-1 ring-danger',
      )}
    >
      {quote !== null ? <QuoteBlock view={quote} onJump={onJumpToMessage} /> : null}
      {content}
    </div>
  );

  const meta = isLast ? (
    <div
      className={cn(
        'flex shrink-0 flex-col text-meta text-muted',
        isStore ? 'items-end text-right' : 'items-start',
      )}
    >
      {isStore ? (
        <span data-testid={testIds.messageSender} className="font-bold">
          {message.author === 'ai' ? copy.message.senderAi : copy.message.senderYou}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <DeliveryStatus message={message} part="meta" onRetry={onRetry} />
        <time data-testid={testIds.messageTime} dateTime={message.createdAt}>
          {formatMessageTime(message.createdAt)}
        </time>
      </span>
    </div>
  ) : null;

  return (
    <div className={cn('flex flex-col gap-0.5', isStore && 'items-end')}>
      <div
        className={cn('flex w-full items-end gap-1.5', isStore ? 'flex-row-reverse' : 'flex-row')}
      >
        {bubble}
        {meta}
      </div>
      <DeliveryStatus message={message} part="below" onRetry={onRetry} />
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleBase);
