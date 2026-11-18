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
import { DeliveryStatus } from '@/features/inbox/DeliveryStatus';
import { copy } from '@/features/inbox/inbox.constants';
import { linkify, type ThreadMessage } from '@/features/inbox/inbox.logic';
import { outgoingStatus } from '@/features/inbox/inbox.send.logic';
import { resolveMedia } from '@/features/inbox/inbox.thread.logic';
import { MediaContent } from '@/features/inbox/MediaContent';

type MessageBubbleProps = {
  message: ThreadMessage;
  /** `customer` bubbles sit on the left; `store` bubbles (admin and AI) on the right. */
  side: 'customer' | 'store';
  /** The last bubble of its group has the small corner, the time and the sender label. */
  isLast: boolean;
  onRetry: (messageId: string) => void;
  onOpenMedia: (message: ThreadMessage, trigger: HTMLElement) => void;
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

/** One bubble with the time and sender beside it and the delivery state under it (ui-screens 5.3). */
function MessageBubbleBase({ message, side, isLast, onRetry, onOpenMedia }: MessageBubbleProps) {
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
        !stickerWorks && (isStore ? 'bg-bubble-out' : 'border border-line bg-surface'),
        status === 'pending' && 'opacity-[0.55]',
        status === 'failed' && 'ring-1 ring-danger',
      )}
    >
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
