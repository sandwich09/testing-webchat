'use client';

// Data hooks of the open chat (ui-screens 5.2, 5.5, 7.3 and 7.7): contact detail, the AI switch,
// mark read and the polled thread. Hooks shared with the contact list and the composer are in
// `inbox.hooks.ts`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/common/common.api';
import {
  mergeContactIntoLists,
  pollController,
  polledQueryFn,
  trackPoll,
  usePollingInterval,
} from '@/common/polling';
import { qk } from '@/common/query-keys';
import type { ContactDetailDto } from '@/contracts';

import { getContact, getMessages, markContactRead, setContactAi } from '../inbox.api';
import { MARK_READ_DELAY_MS } from '../inbox.constants';
import { oldestSeq } from '../inbox.logic';
import { applyOlderPage, loadThread, type ThreadState } from '../inbox.send.logic';

/** A 404 stops the polling of that chat: it will not come back by asking again. */
const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404;

// ---------------------------------------------------------------------------
// Contact detail and the AI switch (ui-screens 5.2, 7.7)
// ---------------------------------------------------------------------------

/** GET /api/contacts/:id, polled while the chat is open. Stops polling on 404 (`thread-not-found`). */
export function useContactDetail(contactId: string) {
  const { intervalFor } = usePollingInterval();
  const key = qk.contact(contactId);
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      trackPoll(pollController, key, () => getContact(contactId, signal), signal),
    staleTime: 0,
    retry: 0,
    refetchInterval: (query) =>
      isNotFound(query.state.error) ? false : intervalFor(query.queryKey),
    refetchIntervalInBackground: false,
  });
}

/**
 * PATCH /api/contacts/:id. Optimistic on `qk.contact(id)`; on failure the old value comes back
 * (show the toast from `mutation.error` or an `onError` passed to `mutate`).
 */
export function useSetContactAi(contactId: string) {
  const client = useQueryClient();
  const key = qk.contact(contactId);
  return useMutation({
    mutationFn: (aiEnabled: boolean) => setContactAi(contactId, aiEnabled),
    onMutate: async (aiEnabled) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ContactDetailDto>(key);
      client.setQueryData<ContactDetailDto>(key, (old) =>
        old === undefined ? old : { ...old, aiEnabled },
      );
      return { previous };
    },
    onError: (_error, _aiEnabled, context) => {
      client.setQueryData(key, context?.previous);
    },
    onSuccess: (contact) => {
      client.setQueryData<ContactDetailDto>(key, (old) =>
        old === undefined ? old : { ...old, ...contact },
      );
      mergeContactIntoLists(client, contact);
    },
  });
}

// ---------------------------------------------------------------------------
// Unread (ui-screens 5.5)
// ---------------------------------------------------------------------------

/**
 * POST /api/contacts/:id/read, delayed by `MARK_READ_DELAY_MS` and joined into one call. Failure
 * shows nothing; the next request tries again.
 */
function useMarkRead(contactId: string): () => void {
  const client = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    [contactId],
  );

  return useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      markContactRead(contactId).then(
        (contact) => {
          mergeContactIntoLists(client, contact);
        },
        () => undefined,
      );
    }, MARK_READ_DELAY_MS);
  }, [client, contactId]);
}

// ---------------------------------------------------------------------------
// Thread (ui-screens 7.3)
// ---------------------------------------------------------------------------

/**
 * Messages of one chat, polled with `afterUpdatedSeq`. Opening the chat clears its unread count;
 * call `requestMarkRead()` when new inbound messages arrive while the tab is visible and the list
 * is at the bottom. `fetchOlder()` loads the page before the oldest `seq`.
 */
export function useThread(contactId: string) {
  const client = useQueryClient();
  const { intervalFor } = usePollingInterval();
  const key = qk.messages(contactId);
  const query = useQuery({
    queryKey: key,
    queryFn: polledQueryFn<ThreadState>(key, ({ reload, getState, signal }) =>
      loadThread({
        reload,
        getState,
        fetchPage: (params, s) => getMessages(contactId, params, s),
        signal,
      }),
    ),
    staleTime: 0,
    retry: 0,
    refetchInterval: (q) => (isNotFound(q.state.error) ? false : intervalFor(q.queryKey)),
    refetchIntervalInBackground: false,
  });

  const requestMarkRead = useMarkRead(contactId);
  const loaded = query.isSuccess;
  useEffect(() => {
    if (loaded) requestMarkRead();
  }, [loaded, requestMarkRead]);

  const [isFetchingOlder, setFetchingOlder] = useState(false);
  const loadingOlder = useRef(false);
  /**
   * The cache gets an older page at once, but the rows reach React a render later. The request
   * counts as running until they do, so MessageList keeps the reader's line until the rows it
   * anchors on are on screen.
   */
  const waitForCache = useRef<ThreadState | null>(null);
  const items = query.data?.items;
  const hasOlder = query.data?.hasOlder ?? false;
  const endOlder = useCallback(() => {
    waitForCache.current = null;
    loadingOlder.current = false;
    setFetchingOlder(false);
  }, []);
  const fetchOlder = useCallback(() => {
    const beforeSeq = items === undefined ? undefined : oldestSeq(items);
    if (loadingOlder.current || !hasOlder || beforeSeq === undefined) return;
    loadingOlder.current = true;
    setFetchingOlder(true);
    getMessages(contactId, { beforeSeq })
      .then((page) => {
        const before = client.getQueryData<ThreadState>(qk.messages(contactId));
        const after = client.setQueryData<ThreadState>(qk.messages(contactId), (state) =>
          state === undefined ? state : applyOlderPage(state, page),
        );
        if (after === undefined || after === before) endOlder();
        else waitForCache.current = after;
      })
      .catch(endOlder); // the next scroll to the top asks again
  }, [client, contactId, items, hasOlder, endOlder]);
  useEffect(() => {
    // The older page is in the rows React renders now (or a later state that contains it).
    if (waitForCache.current !== null && query.data !== undefined) {
      if (query.data.items.length >= waitForCache.current.items.length) endOlder();
    }
  }, [query.data, endOlder]);

  return {
    items: items ?? [],
    hasOlder,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchOlder,
    isFetchingOlder,
    requestMarkRead,
  };
}
