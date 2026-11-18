'use client';

// Data hooks of the chat page (ui-screens 7.2 to 7.5 and 7.7). Cache transitions are the pure
// functions of src/common/polling.ts and inbox.send.logic.ts; this file only wires them.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { v7 as uuidv7 } from 'uuid';

import { ApiError } from '@/common/common.api';
import {
  appendContactPage,
  mergeContactIntoLists,
  pollController,
  polledQueryFn,
  trackPoll,
  useContactListQuery,
  usePollingInterval,
  type ContactListParams,
  type ContactListState,
} from '@/common/polling';
import { qk } from '@/common/query-keys';
import type { ContactDetailDto, MessageDto, SendMessageBody } from '@/contracts';

import {
  getContact,
  getMessages,
  listContacts,
  markContactRead,
  retryMessage,
  sendMessage,
  setContactAi,
} from './inbox.api';
import { MARK_READ_DELAY_MS, SEND_UNCONFIRMED_TIMEOUT_MS } from './inbox.constants';
import { compareContacts, matchesContactFilter, oldestSeq } from './inbox.logic';
import {
  applyOlderPage,
  applySendEvent,
  bodyFromRow,
  buildSendBody,
  failureEvent,
  loadThread,
  optimisticMessage,
  pendingSendOfUpload,
  retryPlan,
  type SendEvent,
  type SendInput,
  type ThreadState,
} from './inbox.send.logic';

export type { ContactListState } from '@/common/polling';
export type { SendInput, ThreadState } from './inbox.send.logic';

const ALL_CONTACTS: ContactListParams = { filter: 'all', q: '' };

/** A 404 stops the polling of that chat: it will not come back by asking again. */
const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404;

// ---------------------------------------------------------------------------
// Contact list (ui-screens 7.2)
// ---------------------------------------------------------------------------

/**
 * The polled contact list of one filter and search. `data.items` are filtered with
 * `matchesContactFilter` and sorted with `compareContacts`. `fetchMore()` loads the next page
 * (`before`) when `data.hasMore`. Without arguments: all contacts (used for `lineConfigured`).
 */
export function useContacts(params: ContactListParams = ALL_CONTACTS) {
  const { filter, q } = params;
  const client = useQueryClient();
  const query = useContactListQuery({ filter, q });
  const [isFetchingMore, setFetchingMore] = useState(false);
  const [fetchMoreError, setFetchMoreError] = useState<unknown>(null);
  const loadingMore = useRef(false);

  const raw = query.data;
  const data = useMemo<ContactListState | undefined>(
    () =>
      raw === undefined
        ? undefined
        : {
            ...raw,
            items: raw.items
              .filter((c) => matchesContactFilter(c, filter, q))
              .sort(compareContacts),
          },
    [raw, filter, q],
  );

  const before = raw?.before ?? null;
  const hasMore = raw?.hasMore ?? false;
  const fetchMore = useCallback(() => {
    if (loadingMore.current || !hasMore || before === null) return;
    loadingMore.current = true;
    setFetchingMore(true);
    setFetchMoreError(null);
    const key = qk.contacts({ filter, q });
    listContacts({ filter, q, before })
      .then((page) => {
        client.setQueryData<ContactListState>(key, (state) =>
          state === undefined ? state : appendContactPage(state, page),
        );
      })
      .catch((error: unknown) => {
        setFetchMoreError(error);
      })
      .finally(() => {
        loadingMore.current = false;
        setFetchingMore(false);
      });
  }, [client, filter, q, before, hasMore]);

  return {
    data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchMore,
    isFetchingMore,
    fetchMoreError,
  };
}

// ---------------------------------------------------------------------------
// Contact detail and the AI switch (ui-screens 5.2, 7.7)
// ---------------------------------------------------------------------------

/** GET /api/contacts/:id, polled while the chat is open. Stops polling on 404 (`thread-not-found`). */
export function useContactDetail(contactId: string) {
  const { intervalMs } = usePollingInterval();
  return useQuery({
    queryKey: qk.contact(contactId),
    queryFn: ({ signal }) => trackPoll(pollController, () => getContact(contactId, signal), signal),
    staleTime: 0,
    retry: 0,
    refetchInterval: (query) => (isNotFound(query.state.error) ? false : intervalMs),
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
  const { intervalMs } = usePollingInterval();
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
    refetchInterval: (q) => (isNotFound(q.state.error) ? false : intervalMs),
    refetchIntervalInBackground: false,
  });

  const requestMarkRead = useMarkRead(contactId);
  const loaded = query.isSuccess;
  useEffect(() => {
    if (loaded) requestMarkRead();
  }, [loaded, requestMarkRead]);

  const [isFetchingOlder, setFetchingOlder] = useState(false);
  const loadingOlder = useRef(false);
  const items = query.data?.items;
  const hasOlder = query.data?.hasOlder ?? false;
  const fetchOlder = useCallback(() => {
    const beforeSeq = items === undefined ? undefined : oldestSeq(items);
    if (loadingOlder.current || !hasOlder || beforeSeq === undefined) return;
    loadingOlder.current = true;
    setFetchingOlder(true);
    getMessages(contactId, { beforeSeq })
      .then((page) => {
        client.setQueryData<ThreadState>(qk.messages(contactId), (state) =>
          state === undefined ? state : applyOlderPage(state, page),
        );
      })
      .catch(() => undefined) // the next scroll to the top asks again
      .finally(() => {
        loadingOlder.current = false;
        setFetchingOlder(false);
      });
  }, [client, contactId, items, hasOlder]);

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

// ---------------------------------------------------------------------------
// Optimistic send (ui-screens 7.5)
// ---------------------------------------------------------------------------

/** Bodies of sends that may have to go again with the same id (module level: survives a chat switch). */
const outbox = new Map<string, SendMessageBody>();

function dispatchSend(client: QueryClient, contactId: string, event: SendEvent): void {
  client.setQueryData<ThreadState>(qk.messages(contactId), (state) => {
    if (state !== undefined) {
      const items = applySendEvent(state.items, event);
      return items === state.items ? state : { ...state, items };
    }
    // Sent before the thread loaded: keep the row; the first load merges it back (no cursor yet,
    // so the query function still loads the first page).
    return event.type === 'started'
      ? { items: applySendEvent([], event), hasOlder: false, cursor: '0' }
      : state;
  });
}

function deliver(
  client: QueryClient,
  contactId: string,
  id: string,
  call: () => Promise<MessageDto>,
): void {
  call()
    .then((message) => {
      outbox.delete(id);
      dispatchSend(client, contactId, { type: 'answered', message });
    })
    .catch((error: unknown) => {
      const event = failureEvent(id, error);
      dispatchSend(client, contactId, event);
      if (event.code === 'client.network') {
        setTimeout(() => {
          dispatchSend(client, contactId, { type: 'timedOut', id });
        }, SEND_UNCONFIRMED_TIMEOUT_MS);
      }
    })
    .finally(() => {
      // The server turns AI off and clears "needs admin" when the admin sends.
      void client.invalidateQueries({ queryKey: qk.contact(contactId) });
    });
}

/**
 * `send(input)` puts the message in the thread at once with an id made here and sends it; it
 * returns the id. `retry(messageId)` sends a failed message again with the same id, so neither a
 * retry nor a double press makes a second message. The text stays in the bubble when sending fails.
 */
export function useSendMessage(contactId: string) {
  const client = useQueryClient();

  const send = useCallback(
    (input: SendInput): string => {
      const pending = pendingSendOfUpload(outbox, input);
      if (pending !== null) return pending;
      const id = uuidv7();
      const body = buildSendBody(id, input);
      const localPreviewUrl = input.kind === 'text' ? undefined : input.localPreviewUrl;
      outbox.set(id, body);
      dispatchSend(client, contactId, {
        type: 'started',
        message: optimisticMessage(contactId, body, new Date().toISOString(), localPreviewUrl),
      });
      deliver(client, contactId, id, () => sendMessage(contactId, body));
      return id;
    },
    [client, contactId],
  );

  const retry = useCallback(
    (messageId: string): void => {
      const row = client
        .getQueryData<ThreadState>(qk.messages(contactId))
        ?.items.find((m) => m.id === messageId);
      if (row === undefined) return;
      const plan = retryPlan(row);
      if (plan === null) return;
      if (plan === 'resend') {
        const body = outbox.get(messageId) ?? bodyFromRow(row);
        if (body === null) return;
        outbox.set(messageId, body);
        dispatchSend(client, contactId, { type: 'resent', id: messageId });
        deliver(client, contactId, messageId, () => sendMessage(contactId, body));
        return;
      }
      dispatchSend(client, contactId, { type: 'resent', id: messageId });
      deliver(client, contactId, messageId, () => retryMessage(contactId, messageId));
    },
    [client, contactId],
  );

  return { send, retry };
}

// ---------------------------------------------------------------------------
// Draft (ui-screens 5.7)
// ---------------------------------------------------------------------------

const drafts = new Map<string, string>();
const draftListeners = new Set<() => void>();

function subscribeDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

/** The composer text of a chat, kept per contact until the page reloads. */
export function useDraft(contactId: string): [string, (value: string) => void] {
  const draft = useSyncExternalStore(
    subscribeDrafts,
    () => drafts.get(contactId) ?? '',
    () => '',
  );
  const setDraft = useCallback(
    (value: string) => {
      if (value === '') drafts.delete(contactId);
      else drafts.set(contactId, value);
      for (const listener of draftListeners) listener();
    },
    [contactId],
  );
  return [draft, setDraft];
}
