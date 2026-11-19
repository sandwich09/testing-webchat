import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ContactListState } from '@/common/polling';
import { qk } from '@/common/query-keys';
import { testIds } from '@/common/test-ids';

import { ContactList } from './ContactList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/chats/c1',
  useSearchParams: () => new URLSearchParams(),
}));

const cached: ContactListState = {
  items: [
    {
      id: 'c1',
      displayName: 'Cached customer',
      pictureUrl: null,
      followStatus: 'following',
      followedAt: null,
      aiEnabled: false,
      needsAdmin: false,
      needsAdminReason: null,
      aiReplying: false,
      unreadCount: 2,
      lastMessage: null,
      createdAt: '2026-11-18T07:00:00.000Z',
      updatedSeq: '1',
    },
  ],
  counts: { all: 1, unread: 1, needsAdmin: 0 },
  lineConfigured: true,
  before: null,
  hasMore: false,
  cursor: '1',
};

describe('ContactList server render and hydration', () => {
  it('shows the skeleton even when the list is already cached, so hydration matches the HTML', () => {
    // The thread loads the same list; when it lands before this Suspense boundary hydrates, the
    // first client render must still be the server's (ui-screens 1.7, `useHydrated`).
    const client = new QueryClient();
    client.setQueryData(qk.contacts({ filter: 'all', q: '' }), cached);
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(ContactList, { selectedContactId: 'c1' }),
      ),
    );
    expect(html).toContain(`data-testid="${testIds.contactListSkeleton}"`);
    expect(html).not.toContain('Cached customer');
    expect(html).not.toContain(`data-testid="${testIds.contactRow}"`);
  });
});
