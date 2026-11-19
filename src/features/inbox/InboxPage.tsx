'use client';

import { useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react';

import { BP_NARROW, BP_WIDE, INFO_WIDTH, LIST_WIDTH } from '@/common/layout.constants';
import { useStoredFlag } from '@/common/useStoredFlag';
import { SectionErrorBoundary } from '@/common/SectionErrorBoundary';
import { cn } from '@/common/common.logic';
import { copy } from '@/features/inbox/inbox.constants';
import { ContactList } from '@/features/inbox/list/ContactList';
import { InfoPanel } from '@/features/inbox/thread/InfoPanel';
import { Thread } from '@/features/inbox/thread/Thread';
import { ThreadPlaceholder } from '@/features/inbox/thread/ThreadPlaceholder';

type ScreenRange = 'wide' | 'medium' | 'narrow';

const INFO_OPEN_KEY = 'tw.infoPanelOpen';

function subscribeRange(onChange: () => void) {
  const queries = [`(min-width: ${String(BP_WIDE)}px)`, `(min-width: ${String(BP_NARROW)}px)`].map(
    (q) => window.matchMedia(q),
  );
  for (const query of queries) query.addEventListener('change', onChange);
  return () => {
    for (const query of queries) query.removeEventListener('change', onChange);
  };
}

function getRange(): ScreenRange {
  if (window.matchMedia(`(min-width: ${String(BP_WIDE)}px)`).matches) return 'wide';
  if (window.matchMedia(`(min-width: ${String(BP_NARROW)}px)`).matches) return 'medium';
  return 'narrow';
}

/** The screen range (ui-screens 1.4). The server render assumes `wide`; the client corrects it on hydration. */
function useScreenRange(): ScreenRange {
  return useSyncExternalStore(subscribeRange, getRange, () => 'wide');
}

/**
 * The chat page: contact list, thread and info panel (ui-screens 1.4 and 4 to 6).
 * `contactId` comes from the URL (`/chats/[contactId]`); null means no chat is selected.
 */
export function InboxPage({ contactId }: { contactId: string | null }) {
  const range = useScreenRange();
  // The wide screen remembers the choice (default open); other ranges start closed (ui-screens 6.1).
  const [wideOpen, setWideOpen] = useStoredFlag(INFO_OPEN_KEY, true);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const infoOpen = contactId !== null && (range === 'wide' ? wideOpen : overlayOpen);

  const toggleInfo = useCallback(() => {
    if (range === 'wide') setWideOpen(!wideOpen);
    else setOverlayOpen((value) => !value);
  }, [range, wideOpen, setWideOpen]);

  const infoMode = range === 'wide' ? 'column' : range === 'medium' ? 'sheet' : 'fullscreen';

  return (
    <div className="relative flex min-h-0 flex-1">
      {contactId !== null ? (
        // On a narrow screen an open chat hides the list and its <h1>; keep the page heading for
        // screen readers (axe page-has-heading-one). Wider screens show the list's own <h1>.
        <h1 className="sr-only medium:hidden">{copy.list.title}</h1>
      ) : null}
      <section
        aria-label={copy.list.title}
        style={{ '--list-w': `${String(LIST_WIDTH)}px` } as CSSProperties}
        className={cn(
          'min-h-0 w-full flex-col border-line bg-surface medium:flex medium:w-(--list-w) medium:shrink-0 medium:border-r',
          contactId === null ? 'flex' : 'hidden',
        )}
      >
        <SectionErrorBoundary>
          <ContactList selectedContactId={contactId} />
        </SectionErrorBoundary>
      </section>

      <section
        className={cn(
          'min-h-0 min-w-0 flex-1 flex-col bg-chat medium:flex wide:min-w-[420px]',
          contactId === null ? 'hidden' : 'flex',
        )}
      >
        <SectionErrorBoundary>
          {contactId === null ? (
            <ThreadPlaceholder />
          ) : (
            <Thread contactId={contactId} infoOpen={infoOpen} onToggleInfo={toggleInfo} />
          )}
        </SectionErrorBoundary>
      </section>

      {infoOpen ? (
        <aside
          style={{ '--info-w': `${String(INFO_WIDTH)}px` } as CSSProperties}
          className={cn(
            'flex min-h-0 flex-col border-l border-line bg-surface',
            infoMode === 'column' && 'w-(--info-w) shrink-0',
            infoMode === 'sheet' &&
              'absolute inset-y-0 right-0 z-20 w-(--info-w) shadow-[-8px_0_24px_rgba(25,19,39,0.12)]',
            infoMode === 'fullscreen' && 'absolute inset-0 z-20 border-l-0',
          )}
        >
          {/* Keyed by the chat: a note being typed, its error and an open dialog belong to one
              customer and never carry over to the next (ui-screens 6). */}
          <SectionErrorBoundary key={contactId}>
            <InfoPanel contactId={contactId} onClose={toggleInfo} mode={infoMode} />
          </SectionErrorBoundary>
        </aside>
      ) : null}
    </div>
  );
}
