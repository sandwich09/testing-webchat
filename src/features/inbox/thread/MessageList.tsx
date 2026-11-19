'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import { copy, QUOTE_HIGHLIGHT_MS } from '@/features/inbox/inbox.constants';
import { useNow } from '@/features/inbox/inbox.hooks';
import {
  groupMessagesForDisplay,
  oldestSeq,
  shouldStickToBottom,
  type ThreadMessage,
} from '@/features/inbox/inbox.logic';
import { DayChip } from '@/features/inbox/thread/DayChip';
import {
  newMessages,
  planTailScroll,
  restoredScrollTop,
  shouldLoadOlder,
} from '@/features/inbox/thread/inbox.thread.logic';
import { MessageGroup } from '@/features/inbox/thread/MessageGroup';
import { NewMessagesButton } from '@/features/inbox/thread/NewMessagesButton';
import { WelcomeCardBubble } from '@/features/inbox/thread/WelcomeCardBubble';
import { SystemLine } from '@/features/inbox/thread/SystemLine';

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type MessageListProps = {
  customer: { id: string; name: string; pictureUrl: string | null };
  items: readonly ThreadMessage[];
  hasOlder: boolean;
  isFetchingOlder: boolean;
  fetchOlder: () => void;
  /** Clears the unread count (debounced by the hook). */
  requestMarkRead: () => void;
  onRetry: (messageId: string) => void;
  onOpenMedia: (message: ThreadMessage, trigger: HTMLElement) => void;
};

/**
 * The message area (ui-screens 5.3 and 5.4): day chips, groups and event lines in time order.
 * Follows new messages only while the reader is at the bottom (otherwise shows the "new
 * messages" button), loads older messages near the top without moving the reader, and always
 * scrolls for a message the admin just sent. Mount it with `key={contactId}` so each chat starts
 * at the bottom.
 */
export function MessageList({
  customer,
  items,
  hasOlder,
  isFetchingOlder,
  fetchOlder,
  requestMarkRead,
  onRetry,
  onOpenMedia,
}: MessageListProps) {
  const now = useNow();
  const display = useMemo(() => groupMessagesForDisplay(items, now), [items, now]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Whether the reader was at the bottom at the last scroll (that is, before the next merge). */
  const stuckRef = useRef(true);
  /** Ids already shown, to tell rows that arrived at the bottom from an older page. */
  const seenRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  /** An older page is being loaded: keep the reader on the same line while content is added above. */
  const anchoringRef = useRef(false);
  const prevHeightRef = useRef(0);
  const autoTriedRef = useRef<string | null>(null);
  /** An inbound message arrived while the reader was away from the bottom. */
  const unreadBelowRef = useRef(false);
  const [hasNew, setHasNew] = useState(false);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (el === null) return;
    if (smooth && !prefersReducedMotion())
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else el.scrollTop = el.scrollHeight;
    stuckRef.current = true;
  }, []);

  // New rows at the bottom: follow, or show the button.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const seen = seenRef.current;

    if (!startedRef.current) {
      if (items.length === 0) return;
      startedRef.current = true; // the first rows: straight to the bottom, no animation
      for (const item of items) seen.add(item.id);
      scrollToBottom(false);
      prevHeightRef.current = el.scrollHeight;
      return;
    }

    const tail = newMessages(items, seen);
    for (const item of items) seen.add(item.id);
    const plan = planTailScroll(tail, stuckRef.current, document.visibilityState === 'visible');
    if (plan.scroll) scrollToBottom(false);
    if (plan.showButton) setHasNew(true);
    if (plan.showButton && plan.inbound) unreadBelowRef.current = true;
    if (plan.markRead) requestMarkRead();
  }, [items, requestMarkRead, scrollToBottom]);

  // Older rows were added above: keep the reader on the same line.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    if (anchoringRef.current) {
      el.scrollTop = restoredScrollTop(
        { scrollTop: el.scrollTop, scrollHeight: prevHeightRef.current },
        el.scrollHeight,
      );
      // Done once the request has ended; a request that never started leaves nothing to keep.
      if (!isFetchingOlder) anchoringRef.current = false;
    }
    prevHeightRef.current = el.scrollHeight;
  }, [items, isFetchingOlder]);

  const loadOlder = useCallback(() => {
    anchoringRef.current = true;
    fetchOlder();
  }, [fetchOlder]);

  // A thread too short to scroll cannot raise a scroll event, so ask for older rows here, once
  // per oldest row so that a failing request is not repeated in a loop.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null || !startedRef.current) return;
    const key = oldestSeq(items) ?? '';
    if (autoTriedRef.current === key) return;
    if (
      el.scrollHeight <= el.clientHeight &&
      shouldLoadOlder({ scrollTop: el.scrollTop, hasOlder, fetching: isFetchingOlder })
    ) {
      autoTriedRef.current = key;
      loadOlder();
    }
  }, [items, hasOlder, isFetchingOlder, loadOlder]);

  // Images and video previews change the height after they load; stay at the bottom if the
  // reader is there. The scroll box itself changes size when the composer grows.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (el === null || content === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stuckRef.current && !anchoringRef.current) el.scrollTop = el.scrollHeight;
      prevHeightRef.current = el.scrollHeight;
    });
    observer.observe(content);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const stuck = shouldStickToBottom(el);
    stuckRef.current = stuck;
    if (stuck) {
      setHasNew(false);
      if (unreadBelowRef.current && document.visibilityState === 'visible') {
        unreadBelowRef.current = false;
        requestMarkRead();
      }
    }
    if (shouldLoadOlder({ scrollTop: el.scrollTop, hasOlder, fetching: isFetchingOlder })) {
      loadOlder();
    }
  }, [hasOlder, isFetchingOlder, loadOlder, requestMarkRead]);

  // A quote jumps to its message when it is in the loaded rows: centred, then highlighted for
  // QUOTE_HIGHLIGHT_MS through `data-highlight`. A message not loaded is left alone.
  const highlightTimer = useRef<number | null>(null);
  const onJumpToMessage = useCallback((messageId: string) => {
    const el = scrollRef.current;
    const target = el?.querySelector<HTMLElement>(
      `[data-testid="${testIds.messageBubble}"][data-message-id="${CSS.escape(messageId)}"]`,
    );
    if (target === null || target === undefined) return;
    target.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    for (const old of el?.querySelectorAll('[data-highlight="true"]') ?? []) {
      old.removeAttribute('data-highlight');
    }
    target.setAttribute('data-highlight', 'true');
    highlightTimer.current = window.setTimeout(() => {
      target.removeAttribute('data-highlight');
      highlightTimer.current = null;
    }, QUOTE_HIGHLIGHT_MS);
  }, []);

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const onJumpToBottom = useCallback(() => {
    scrollToBottom(true);
    setHasNew(false);
    scrollRef.current?.focus({ preventScroll: true });
  }, [scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label={copy.thread.logLabel}
        tabIndex={0}
        data-testid={testIds.messageList}
        onScroll={onScroll}
        // The browser's own scroll anchoring would fight the manual one above.
        style={{ overflowAnchor: 'none' }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 medium:px-5 medium:py-4"
      >
        <div ref={contentRef} className="flex min-h-full flex-col">
          {isFetchingOlder ? (
            <div data-testid={testIds.messageLoadOlder} role="status" className="mb-3.5">
              <Skeleton className="h-9 w-44 rounded-[17px]" />
              <span className="sr-only">{copy.thread.loadingOlder}</span>
            </div>
          ) : null}

          {display.length === 0 ? (
            <p
              data-testid={testIds.threadEmpty}
              className="m-auto px-6 py-10 text-center text-body text-muted"
            >
              {copy.thread.empty}
            </p>
          ) : (
            display.map((item) => {
              switch (item.kind) {
                case 'day':
                  return <DayChip key={item.key} label={item.label} />;
                case 'event':
                  return <SystemLine key={item.key} message={item.message} />;
                case 'welcome':
                  return <WelcomeCardBubble key={item.key} message={item.message} />;
                case 'group':
                  return (
                    <MessageGroup
                      key={item.key}
                      author={item.author}
                      messages={item.messages}
                      customer={customer}
                      onRetry={onRetry}
                      onOpenMedia={onOpenMedia}
                      onJumpToMessage={onJumpToMessage}
                    />
                  );
              }
            })
          )}
        </div>
      </div>
      {hasNew ? <NewMessagesButton onClick={onJumpToBottom} /> : null}
    </div>
  );
}
