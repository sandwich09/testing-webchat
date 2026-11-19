'use client';

// Hooks shared by more than one area of the chat page (ui-screens 7.2 and 7.5): the contact list
// (list and thread), the optimistic send (thread and composer) and the minute clock (list and
// thread). Cache transitions are the
// pure functions of src/common/polling.ts and inbox.send.logic.ts; this file only wires them.
// Hooks of one area live in that area's `*.hooks.ts`.
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';

import {
  appendContactPage,
  useContactListQuery,
  type ContactListParams,
  type ContactListState,
} from '@/common/polling';
import { qk } from '@/common/query-keys';
import type { MessageDto, SendMessageBody } from '@/contracts';

import { listContacts, retryMessage, sendMessage } from './inbox.api';
import { SEND_UNCONFIRMED_TIMEOUT_MS } from './inbox.constants';
import { compareContacts, matchesContactFilter } from './inbox.logic';
import {
  applySendEvent,
  bodyFromRow,
  buildSendBody,
  failureEvent,
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

// ---------------------------------------------------------------------------
// Clock of relative times (contact list times, day chips of the thread)
// ---------------------------------------------------------------------------

/** Relative times and day labels are recomputed this often. */
const NOW_TICK_MS = 60_000;

/** The current time, ticking once a minute so "today" turns into "yesterday" at midnight. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, NOW_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

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
