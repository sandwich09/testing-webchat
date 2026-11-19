'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppProviders } from '@/common/AppProviders';
import { AppRail } from '@/common/AppRail';
import { ApiError, errorCodeOf, lock } from '@/common/common.api';
import { copy } from '@/common/common.constants';
import { ConnectionBanner } from '@/common/ConnectionBanner';
import { errorMessage } from '@/common/error-messages';
import {
  pollController,
  useContactListQuery,
  usePollingInterval,
  usePollingLifecycle,
  useUnreadCount,
} from '@/common/polling';
import { SectionErrorBoundary } from '@/common/SectionErrorBoundary';
import { showToast } from '@/common/toast';
import { useStoredFlag } from '@/common/useStoredFlag';

const RAIL_COLLAPSED_KEY = 'tw.railCollapsed';
const ALL_CONTACTS = { filter: 'all', q: '' } as const;

/**
 * Logout (ui-screens 3.1): on success or 401, stop every query and load `/chats` again as a new
 * page, which shows the welcome page. A full page load (not `router.replace` after
 * `client.clear()`) is used because clearing the cache while the queries are still mounted makes
 * them fetch again at once and answer 401, and because it also drops the in-memory drafts.
 */
function useLogout() {
  const client = useQueryClient();
  const signedOut = (): void => {
    void client.cancelQueries();
    pollController.reset();
    window.location.replace('/chats');
  };
  return useMutation({
    mutationFn: lock,
    onSuccess: signedOut,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        signedOut();
        return;
      }
      showToast(
        'error',
        errorMessage(errorCodeOf(error)) ??
          errorMessage('internal.unexpected') ??
          copy.error.network,
      );
    },
  });
}

/**
 * Frame of the signed-in pages (ui-screens 3.1): rail, content and the connection banner. It polls
 * the contact list while the chat page is closed so the rail always has the unread count, and it
 * reloads every polled list when the tab is shown again.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useStoredFlag(RAIL_COLLAPSED_KEY, false);
  const pathname = usePathname();
  const chatPageOpen = pathname.startsWith('/chats');

  usePollingLifecycle();
  // On the chat page the list it shows is current, and the rail reads its counts.
  useContactListQuery(ALL_CONTACTS, { enabled: !chatPageOpen });
  const unreadCount = useUnreadCount();
  const { showBanner } = usePollingInterval();
  const logout = useLogout();

  return (
    <AppProviders>
      {/* The shell is the viewport: it is the containing block of every absolutely placed
          element inside (such as `sr-only` text in a scrolling list) and clips it, so only the
          inner containers scroll and the document never does. */}
      <div className="relative flex h-screen flex-col overflow-hidden bg-page supports-[height:100dvh]:h-dvh medium:flex-row">
        <a
          href="#main"
          className="sr-only bg-surface text-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:px-4 focus:py-2"
        >
          {copy.skipToContent}
        </a>
        <SectionErrorBoundary>
          <AppRail
            unreadCount={unreadCount}
            collapsed={collapsed}
            onToggleCollapsed={() => {
              setCollapsed(!collapsed);
            }}
            onLogout={() => {
              if (!logout.isPending) logout.mutate();
            }}
          />
        </SectionErrorBoundary>
        <main id="main" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {showBanner ? <ConnectionBanner /> : null}
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
