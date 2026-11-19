'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { copy as commonCopy } from '@/common/common.constants';
import { useHydrated } from '@/common/common.hooks';
import { EmptyState } from '@/common/EmptyState';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';
import type { ContactFilter } from '@/contracts';

import { copy, SEARCH_DEBOUNCE_MS } from '../inbox.constants';
import { useContacts, useNow } from '../inbox.hooks';
import { ContactListSkeleton } from './ContactListSkeleton';
import { ContactListTabs } from './ContactListTabs';
import { ContactRow } from './ContactRow';
import { ContactSearch } from './ContactSearch';
import {
  emptyState,
  filterQuery,
  nextRowIndex,
  parseFilter,
  tabbableRowId,
} from './inbox.list.logic';

/** `value` after it has stopped changing for `delayMs`. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

/** Calls `onVisible` whenever the sentinel scrolls into view (and again if it stays in view). */
function useSentinel(enabled: boolean, onVisible: () => void) {
  const node = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const target = node.current;
    if (!enabled || target === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callback.current();
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [enabled]);
  return node;
}

function ContactListInner({ selectedContactId }: { selectedContactId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseFilter(searchParams.get('filter'));
  const panelId = useId();

  const [searchInput, setSearchInput] = useState('');
  const q = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const now = useNow();

  const list = useContacts({ filter, q });
  const { fetchMore, isFetchingMore, fetchMoreError } = list;
  // The list sits under a Suspense boundary, which React may hydrate after the thread has already
  // loaded the same contact list into the cache. The first client render must match the server
  // HTML (no data yet), so the rows show only once hydration is over.
  const hydrated = useHydrated();
  const data = hydrated ? list.data : undefined;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const changeFilter = useCallback(
    (next: ContactFilter) => {
      if (next === filter) return;
      router.replace(`${pathname}${filterQuery(next)}`, { scroll: false });
    },
    [filter, pathname, router],
  );

  const hasMore = data?.hasMore === true;
  const sentinel = useSentinel(hasMore && !isFetchingMore && fetchMoreError === null, fetchMore);

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const current = links.findIndex((link) => link === document.activeElement);
    if (current === -1) return;
    const next = nextRowIndex(event.key, current, links.length);
    if (next === null) return;
    event.preventDefault();
    links[next]?.focus();
  }

  const items = data?.items ?? [];
  const tabbableId = tabbableRowId(
    items.map((c) => c.id),
    focusedId,
    selectedContactId,
  );

  let body;
  if (hydrated && list.isError && data === undefined) {
    body = (
      <ErrorState
        message={copy.list.error}
        onRetry={() => {
          void list.refetch();
        }}
        testId={testIds.contactListError}
        retryTestId={testIds.contactListRetry}
      />
    );
  } else if (data === undefined) {
    body = <ContactListSkeleton testId={testIds.contactListSkeleton} />;
  } else if (items.length === 0) {
    const empty = emptyState(filter, q, data.lineConfigured);
    if (empty.kind === 'noLine') {
      body = (
        <EmptyState
          testId={testIds.contactListEmpty}
          title={empty.title}
          body={empty.body}
          action={
            <Button asChild variant="secondary">
              <Link href="/settings" data-testid={testIds.contactListGoSettings}>
                {copy.list.goToSettings}
              </Link>
            </Button>
          }
        />
      );
    } else if (empty.kind === 'noContacts') {
      body = <EmptyState testId={testIds.contactListEmpty} title={empty.title} body={empty.body} />;
    } else {
      body = <EmptyState testId={testIds.contactListEmpty} title={empty.text} />;
    }
  } else {
    body = (
      <>
        <ul
          ref={listRef}
          data-testid={testIds.contactList}
          aria-label={copy.list.title}
          onKeyDown={onListKeyDown}
        >
          {items.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              selected={contact.id === selectedContactId}
              now={now}
              filter={filter}
              tabbable={contact.id === tabbableId}
              onFocus={() => {
                setFocusedId(contact.id);
              }}
            />
          ))}
        </ul>
        {isFetchingMore ? <ContactListSkeleton rows={2} testId={testIds.contactListMore} /> : null}
        {fetchMoreError !== null ? (
          <div role="alert" className="flex flex-col items-center gap-2 px-4 py-4 text-center">
            <p className="text-sub text-fg">{copy.list.error}</p>
            <Button variant="secondary" size="sm" onClick={fetchMore}>
              {commonCopy.action.retry}
            </Button>
          </div>
        ) : null}
        {hasMore ? <div ref={sentinel} aria-hidden="true" className="h-px" /> : null}
      </>
    );
  }

  return (
    <>
      <h1 className="px-4 pt-4 pb-2 text-title font-bold text-fg">{copy.list.title}</h1>
      <ContactSearch value={searchInput} onChange={setSearchInput} />
      <ContactListTabs
        filter={filter}
        onChange={changeFilter}
        counts={data === undefined ? null : data.counts}
        panelId={panelId}
      />
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${filter}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {body}
      </div>
    </>
  );
}

/**
 * Contact list column: title, search, tabs and the rows (ui-screens 4). The tab lives in the URL
 * (`?filter=`), so `useSearchParams` needs the Suspense boundary.
 */
export function ContactList({ selectedContactId }: { selectedContactId: string | null }) {
  return (
    <Suspense fallback={<ContactListSkeleton testId={testIds.contactListSkeleton} />}>
      <ContactListInner selectedContactId={selectedContactId} />
    </Suspense>
  );
}
