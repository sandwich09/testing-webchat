'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { useSettings } from '@/common/common.hooks';
import { ErrorState } from '@/common/ErrorState';
import { AVATAR_HEADER, BP_NARROW, THREAD_HEADER_HEIGHT } from '@/common/layout.constants';
import { SectionErrorBoundary } from '@/common/SectionErrorBoundary';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import { Composer } from '@/features/inbox/Composer';
import { copy } from '@/features/inbox/inbox.constants';
import {
  useContactDetail,
  useContacts,
  useSendMessage,
  useThread,
} from '@/features/inbox/inbox.hooks';
import { composerDisabledReason, type ComposerBlock } from '@/features/inbox/inbox.logic';
import { MediaLightbox } from '@/features/inbox/MediaLightbox';
import { MessageList } from '@/features/inbox/MessageList';
import { ThreadHeader } from '@/features/inbox/ThreadHeader';

type ThreadProps = { contactId: string; infoOpen: boolean; onToggleInfo: () => void };

const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404;

const DISABLED_REASON_TEXT: Record<Exclude<ComposerBlock, null>, string> = {
  unfollowed: copy.composer.disabled.unfollowed,
  line_not_configured: copy.composer.disabled.lineNotConfigured,
};

/** Widths of the placeholder bubbles, in percent of the message area (ui-screens 5.6). */
const SKELETON_BUBBLE_WIDTHS = [55, 40, 65, 45, 60, 50] as const;

function ThreadSkeleton() {
  return (
    <div
      data-testid={testIds.threadSkeleton}
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col"
    >
      <span className="sr-only">{commonCopy.loading}</span>
      <div
        style={{ height: THREAD_HEADER_HEIGHT }}
        className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4"
      >
        <Skeleton
          className="rounded-full"
          style={{ width: AVATAR_HEADER, height: AVATAR_HEADER }}
        />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden p-3 medium:px-5 medium:py-4">
        {SKELETON_BUBBLE_WIDTHS.map((width, index) => (
          <div key={index} className={index % 2 === 0 ? 'flex justify-start' : 'flex justify-end'}>
            <Skeleton className="h-10 rounded-[17px]" style={{ width: `${String(width)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreadInner({ contactId, infoOpen, onToggleInfo }: ThreadProps) {
  const contact = useContactDetail(contactId);
  const thread = useThread(contactId);
  const settings = useSettings();
  const contacts = useContacts();
  const { retry } = useSendMessage(contactId);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  // The lightbox: which message, and the preview button to give focus back to when it closes.
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxTrigger, setLightboxTrigger] = useState<HTMLElement | null>(null);
  const openMedia = useCallback((message: { id: string }, trigger: HTMLElement) => {
    setLightboxTrigger(trigger);
    setLightboxId(message.id);
  }, []);
  const closeLightbox = useCallback(() => {
    setLightboxId(null);
  }, []);

  const detail = contact.data;
  const lineConfigured = contacts.data?.lineConfigured ?? true;
  const block = detail === undefined ? null : composerDisabledReason(detail, lineConfigured);
  const normal = detail !== undefined && !thread.isPending;

  // Open the chat at 720px and wider with the cursor in the composer (ui-screens 5.11). A narrow
  // screen does not, so the keyboard does not jump up.
  useEffect(() => {
    if (!normal || block !== null || focusedRef.current) return;
    focusedRef.current = true;
    if (!window.matchMedia(`(min-width: ${String(BP_NARROW)}px)`).matches) return;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-testid="${testIds.composerInput}"]`)
      ?.focus({ preventScroll: true });
  }, [normal, block]);

  if (isNotFound(contact.error) || isNotFound(thread.error)) {
    return (
      <div
        data-testid={testIds.threadNotFound}
        className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <p className="text-body">{copy.thread.notFound}</p>
        <Link
          href="/chats"
          className="inline-flex min-h-11 items-center px-3 text-sub font-bold underline underline-offset-4"
        >
          {copy.thread.backToList}
        </Link>
      </div>
    );
  }

  const failed =
    (contact.isError && detail === undefined) || (thread.isError && thread.items.length === 0);
  if (failed) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState
          message={copy.thread.error}
          testId={testIds.threadError}
          retryTestId={testIds.threadRetry}
          onRetry={() => {
            if (contact.isError) void contact.refetch();
            if (thread.isError) void thread.refetch();
          }}
        />
      </div>
    );
  }

  if (!normal) return <ThreadSkeleton />;

  const customer = {
    id: detail.id,
    name: detail.displayName ?? copy.contact.unnamed,
    pictureUrl: detail.pictureUrl,
  };
  const lightboxMessage =
    lightboxId === null ? null : (thread.items.find((m) => m.id === lightboxId) ?? null);

  return (
    <div ref={rootRef} data-testid={testIds.thread} className="flex min-h-0 flex-1 flex-col">
      <SectionErrorBoundary>
        <ThreadHeader
          contact={detail}
          killSwitchOn={settings.data?.ai.enabled ?? true}
          infoOpen={infoOpen}
          onToggleInfo={onToggleInfo}
        />
      </SectionErrorBoundary>
      <SectionErrorBoundary
        onRetry={() => {
          void thread.refetch();
        }}
      >
        <MessageList
          customer={customer}
          items={thread.items}
          hasOlder={thread.hasOlder}
          isFetchingOlder={thread.isFetchingOlder}
          fetchOlder={thread.fetchOlder}
          requestMarkRead={thread.requestMarkRead}
          onRetry={retry}
          onOpenMedia={openMedia}
        />
      </SectionErrorBoundary>
      <SectionErrorBoundary>
        <Composer
          contactId={contactId}
          disabled={block !== null}
          disabledReason={block === null ? null : DISABLED_REASON_TEXT[block]}
        />
      </SectionErrorBoundary>
      <MediaLightbox
        message={lightboxMessage}
        onClose={closeLightbox}
        returnFocusTo={lightboxTrigger}
      />
    </div>
  );
}

/**
 * One chat: header, message area, composer and the media lightbox (ui-screens 5). Each part has
 * its own error boundary. The chat is keyed by contact so switching chats starts clean (scroll,
 * lightbox, focus).
 */
export function Thread(props: ThreadProps) {
  return <ThreadInner key={props.contactId} {...props} />;
}
