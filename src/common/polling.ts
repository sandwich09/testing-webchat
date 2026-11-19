'use client';

// Shared polling round of the app (ui-screens 7.4) and the contact-list cache (ui-screens 7.2),
// which lives here because the shell polls it on every page and src/common may not import a
// feature. The cursor rules are the polling protocol of api-contract: every round asks
// `afterUpdatedSeq = pollAfter(cursor)`, merges by id and moves the cursor with `advanceCursor`.
import {
  hashKey,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryFunctionContext,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import {
  isClientError,
  listContacts,
  type ContactsPage,
  type ListContactsParams,
} from '@/common/common.api';
import { POLL_FAILURES_BEFORE_BANNER } from '@/common/common.constants';
import { useSettings } from '@/common/common.hooks';
import { advanceCursor, mergeById, nextPollDelay, pollAfter } from '@/common/common.logic';
import { qk, qkAll } from '@/common/query-keys';
import type { ContactDto, ContactFilter } from '@/contracts';

// ---------------------------------------------------------------------------
// Poll controller: one failure counter for the whole page (one banner), and the reload generation
// that tells every polled list to drop its cursor and load its first page again.
// ---------------------------------------------------------------------------

export type PollSnapshot = { readonly failures: number; readonly generation: number };

export type PollController = {
  getSnapshot: () => PollSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** A polled query failed (network, 5xx or an answer that broke the contract). */
  recordFailure: () => void;
  /** A polled query succeeded. After failures this asks every list to reload. */
  recordSuccess: () => void;
  /** The tab became visible again: every list reloads its first page. */
  requestReload: () => void;
  /** Whether a list loaded before the latest reload request must load its first page again. */
  needsReload: (keyHash: string) => boolean;
  /** Records that a list loaded its first page while `generation` was current. */
  markLoaded: (keyHash: string, generation: number) => void;
  /** Runs on every reload request; the shell sets it to refetch the polled queries. */
  setReloadHandler: (handler: (() => void) | null) => void;
  /** Back to the start, for a new session after a 401 or logout. */
  reset: () => void;
};

const INITIAL_SNAPSHOT: PollSnapshot = { failures: 0, generation: 0 };

export function createPollController(): PollController {
  let snapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();
  const loadedAt = new Map<string, number>();
  let reloadHandler: (() => void) | null = null;

  const publish = (next: PollSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const reload = (failures: number): void => {
    publish({ failures, generation: snapshot.generation + 1 });
    reloadHandler?.();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recordFailure() {
      publish({ ...snapshot, failures: snapshot.failures + 1 });
    },
    recordSuccess() {
      // Rows can be missed beyond the overlap while the connection was down: reload everything.
      if (snapshot.failures > 0) reload(0);
    },
    requestReload() {
      reload(snapshot.failures);
    },
    needsReload(keyHash) {
      return loadedAt.get(keyHash) !== snapshot.generation;
    },
    markLoaded(keyHash, generation) {
      loadedAt.set(keyHash, generation);
    },
    setReloadHandler(handler) {
      reloadHandler = handler;
    },
    reset() {
      loadedAt.clear();
      publish(INITIAL_SNAPSHOT);
    },
  };
}

/** The controller of the running app. */
export const pollController = createPollController();

/**
 * Whether a failed round counts toward the connection banner. A 4xx (a chat that does not exist,
 * a 401) is an answer, not a connection problem; a cancel is not a round at all.
 */
export function countsAsPollFailure(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted === true) return false;
  return !isClientError(error);
}

/** Runs one round of a polled query and keeps the shared failure counter. */
export async function trackPoll<T>(
  controller: PollController,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (countsAsPollFailure(error, signal)) controller.recordFailure();
    throw error;
  }
  controller.recordSuccess();
  return result;
}

export type PolledLoad<S> = (ctx: {
  /** No usable cursor: load the first page (first load, tab visible again, connection back). */
  reload: boolean;
  /** The cache as it is now. Read it again after every await: a send may have changed it. */
  getState: () => S | undefined;
  signal: AbortSignal;
}) => Promise<S>;

/**
 * Query function of a polled list whose cache holds a cursor. It picks between a first-page load
 * and a polling round, counts the round for the banner and remembers the generation it loaded at.
 */
export function polledQueryFn<S>(
  key: QueryKey,
  load: PolledLoad<S>,
  controller: PollController = pollController,
): (ctx: QueryFunctionContext) => Promise<S> {
  return async ({ client, signal }) => {
    const keyHash = hashKey(key);
    const { generation } = controller.getSnapshot();
    const reload = client.getQueryData(key) === undefined || controller.needsReload(keyHash);
    const state = await trackPoll(
      controller,
      () => load({ reload, getState: () => client.getQueryData<S>(key), signal }),
      signal,
    );
    if (reload) controller.markLoaded(keyHash, generation);
    return state;
  };
}

/** Delay before the next round: `false` while the interval from the settings is not known yet. */
export function pollingIntervalOf(baseMs: number | null, failures: number): number | false {
  return baseMs === null ? false : nextPollDelay(failures, baseMs);
}

export type PollingInterval = {
  /** `client.pollIntervalMs` from GET /api/settings, `null` until it has loaded. */
  baseMs: number | null;
  /** Value for `refetchInterval`: the base, backed off after failures, or `false`. */
  intervalMs: number | false;
  /** Failed rounds in a row, of any polled query. */
  failures: number;
  /** Whether `ConnectionBanner` shows. */
  showBanner: boolean;
};

const getServerSnapshot = (): PollSnapshot => INITIAL_SNAPSHOT;

function usePollSnapshot(controller: PollController = pollController): PollSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, getServerSnapshot);
}

/**
 * The polling interval of the app and its back-off (ui-screens 7.4). The base comes from the
 * settings answer, never from a `NEXT_PUBLIC_` variable.
 */
export function usePollingInterval(): PollingInterval {
  const settings = useSettings();
  const { failures } = usePollSnapshot();
  const baseMs = settings.data?.client.pollIntervalMs ?? null;
  return {
    baseMs,
    intervalMs: pollingIntervalOf(baseMs, failures),
    failures,
    showBanner: failures >= POLL_FAILURES_BEFORE_BANNER,
  };
}

/** Refetches every polled list; their query functions see the new generation and reload. */
export function reloadPolledQueries(client: QueryClient): void {
  for (const queryKey of [qkAll.contacts, qkAll.messages, qkAll.contact]) {
    void client.invalidateQueries({ queryKey });
  }
  // Without settings there is no interval, so nothing would poll again.
  if (client.getQueryData(qk.settings()) === undefined) {
    void client.invalidateQueries({ queryKey: qk.settings() });
  }
}

/**
 * Mounted once by the shell: reloads every polled list when the tab becomes visible again or when
 * the connection comes back. Hidden tabs do not poll (`refetchIntervalInBackground: false`).
 */
export function usePollingLifecycle(controller: PollController = pollController): void {
  const client = useQueryClient();
  useEffect(() => {
    controller.setReloadHandler(() => {
      reloadPolledQueries(client);
    });
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') controller.requestReload();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.setReloadHandler(null);
    };
  }, [client, controller]);
}

// ---------------------------------------------------------------------------
// Contact list cache (ui-screens 7.2)
// ---------------------------------------------------------------------------

/**
 * Cache value of `qk.contacts(*)`. `items` holds every row merged into the list; the chat page
 * filters them with `matchesContactFilter` and sorts them with `compareContacts` when it reads them
 * (the shell cannot import those, and it writes the same key).
 */
export type ContactListState = {
  items: ContactDto[];
  counts: { all: number; unread: number; needsAdmin: number };
  lineConfigured: boolean;
  /** Cursor of the next page. */
  before: string | null;
  /** Whether there is a next page. */
  hasMore: boolean;
  /** Highest `highWater` seen (`updatedSeq`). */
  cursor: string;
};

export type ContactListParams = { filter: ContactFilter; q: string };

/** State after a first-page load. The cursor never moves back, even on a reload. */
export function contactListFromPage(
  page: ContactsPage,
  previous: ContactListState | undefined,
): ContactListState {
  return {
    items: page.contacts,
    counts: page.counts,
    lineConfigured: page.lineConfigured,
    before: page.before,
    hasMore: page.hasMore,
    cursor:
      previous === undefined ? page.highWater : advanceCursor(previous.cursor, page.highWater),
  };
}

/** Merges one polling answer: rows by id, latest counts, cursor forward. Paging is untouched. */
export function applyContactPoll(state: ContactListState, page: ContactsPage): ContactListState {
  return {
    ...state,
    items: mergeById(state.items, page.contacts),
    counts: page.counts,
    lineConfigured: page.lineConfigured,
    cursor: advanceCursor(state.cursor, page.highWater),
  };
}

/** Appends the next page (`before`). The polling cursor is untouched. */
export function appendContactPage(state: ContactListState, page: ContactsPage): ContactListState {
  return {
    ...state,
    items: mergeById(state.items, page.contacts),
    counts: page.counts,
    lineConfigured: page.lineConfigured,
    before: page.before,
    hasMore: page.hasMore,
  };
}

/** Writes a contact returned by a mutation into a list. */
export function mergeContactIntoList(
  state: ContactListState,
  contact: ContactDto,
): ContactListState {
  return { ...state, items: mergeById(state.items, [contact]) };
}

/**
 * One load of a contact list: the first page, or a polling round that keeps asking while
 * `hasMore` is true (stops if the cursor does not move, so a bad answer cannot loop).
 */
export async function loadContactList(deps: {
  params: ContactListParams;
  reload: boolean;
  getState: () => ContactListState | undefined;
  fetchPage: (params: ListContactsParams, signal: AbortSignal) => Promise<ContactsPage>;
  signal: AbortSignal;
}): Promise<ContactListState> {
  const { params, signal } = deps;
  const start = deps.getState();
  if (deps.reload || start === undefined) {
    const page = await deps.fetchPage({ filter: params.filter, q: params.q }, signal);
    return contactListFromPage(page, deps.getState());
  }
  const pages: ContactsPage[] = [];
  let cursor = start.cursor;
  for (;;) {
    const page = await deps.fetchPage({ afterUpdatedSeq: pollAfter(cursor) }, signal);
    pages.push(page);
    const next = advanceCursor(cursor, page.highWater);
    if (!page.hasMore || next === cursor) break;
    cursor = next;
  }
  return pages.reduce(applyContactPoll, deps.getState() ?? start);
}

/**
 * The polled contact list of one filter and search (`qk.contacts(params)`). The shell uses it with
 * `{ filter: "all", q: "" }` while the chat page is not open; the chat page wraps it in `useContacts`.
 */
export function useContactListQuery(
  params: ContactListParams,
  options: { enabled?: boolean } = {},
) {
  const { intervalMs } = usePollingInterval();
  const key = qk.contacts(params);
  return useQuery({
    queryKey: key,
    queryFn: polledQueryFn<ContactListState>(key, ({ reload, getState, signal }) =>
      loadContactList({ params, reload, getState, fetchPage: listContacts, signal }),
    ),
    enabled: options.enabled ?? true,
    staleTime: 0,
    retry: 0,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
}

/** Writes a contact returned by a mutation into every cached contact list. */
export function mergeContactIntoLists(client: QueryClient, contact: ContactDto): void {
  client.setQueriesData<ContactListState>({ queryKey: qkAll.contacts }, (state) =>
    state === undefined ? state : mergeContactIntoList(state, contact),
  );
}

/** `counts` of the contact list updated most recently, whatever its filter. */
export function latestContactCounts(client: QueryClient): ContactListState['counts'] | undefined {
  let latest: { at: number; counts: ContactListState['counts'] } | undefined;
  for (const query of client.getQueryCache().findAll({ queryKey: qkAll.contacts })) {
    const data = query.state.data as ContactListState | undefined; // every qk.contacts value is a ContactListState
    if (data === undefined) continue;
    if (latest === undefined || query.state.dataUpdatedAt > latest.at) {
      latest = { at: query.state.dataUpdatedAt, counts: data.counts };
    }
  }
  return latest?.counts;
}

/** Unread chats for the rail: from whichever contact list is current (ui-screens 3.1, 7.2). */
export function useUnreadCount(): number {
  const client = useQueryClient();
  return useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => latestContactCounts(client)?.unread ?? 0,
    () => 0,
  );
}
