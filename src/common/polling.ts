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
import { useCallback, useEffect, useSyncExternalStore } from 'react';

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
// Poll controller: the failures of each polled query (its own back-off; the banner shows while any
// one keeps failing), and the reload generation that tells every polled list to load its first
// page again and merge it into what it holds.
// ---------------------------------------------------------------------------

export type PollSnapshot = {
  /** The most failures in a row of any one polled query: what the banner shows from. */
  readonly failures: number;
  readonly generation: number;
};

export type PollController = {
  getSnapshot: () => PollSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** A round of the query `keyHash` failed (network, 5xx or an answer that broke the contract). */
  recordFailure: (keyHash: string) => void;
  /**
   * A round of the query `keyHash` succeeded. When that query had failed, the connection is back,
   * so every list reloads, at most once per recovery and at most once per minimum gap.
   */
  recordSuccess: (keyHash: string) => void;
  /** Failures in a row of one query, for its own back-off. */
  failuresOf: (keyHash: string) => number;
  /** The tab became visible again: every list reloads its first page. */
  requestReload: () => void;
  /** Whether a list loaded before the latest reload request must load its first page again. */
  needsReload: (keyHash: string) => boolean;
  /** Records that a list loaded its first page while `generation` was current. */
  markLoaded: (keyHash: string, generation: number) => void;
  /** Runs on every reload request; the shell sets it to refetch the polled queries. */
  setReloadHandler: (handler: (() => void) | null) => void;
  /** Shortest time between two reloads after a recovery: the base polling interval. */
  setMinReloadGap: (ms: number) => void;
  /** Back to the start, for a new session after a 401 or logout. */
  reset: () => void;
};

const INITIAL_SNAPSHOT: PollSnapshot = { failures: 0, generation: 0 };

export type PollControllerDeps = {
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
};

const browserTimers: PollControllerDeps = {
  now: () => Date.now(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>); // only values setTimer returned
  },
};

export function createPollController(deps: PollControllerDeps = browserTimers): PollController {
  let snapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();
  const loadedAt = new Map<string, number>();
  const failures = new Map<string, number>();
  let reloadHandler: (() => void) | null = null;
  let minReloadGapMs = 0;
  let lastReloadAt = Number.NEGATIVE_INFINITY;
  let pendingReload: unknown = null;

  const publish = (next: PollSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const worst = (): number => Math.max(0, ...failures.values());
  const reload = (): void => {
    if (pendingReload !== null) deps.clearTimer(pendingReload);
    pendingReload = null;
    lastReloadAt = deps.now();
    publish({ failures: worst(), generation: snapshot.generation + 1 });
    reloadHandler?.();
  };
  /** A recovery: at once when the last reload is old enough, otherwise once when it is. */
  const reloadAfterRecovery = (): void => {
    if (pendingReload !== null) return;
    const wait = lastReloadAt + minReloadGapMs - deps.now();
    if (wait <= 0) reload();
    else pendingReload = deps.setTimer(reload, wait);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recordFailure(keyHash) {
      failures.set(keyHash, (failures.get(keyHash) ?? 0) + 1);
      publish({ ...snapshot, failures: worst() });
    },
    recordSuccess(keyHash) {
      const had = failures.get(keyHash) ?? 0;
      if (had === 0) return;
      failures.delete(keyHash);
      publish({ ...snapshot, failures: worst() });
      // Rows can be missed beyond the overlap while the connection was down.
      reloadAfterRecovery();
    },
    failuresOf: (keyHash) => failures.get(keyHash) ?? 0,
    requestReload() {
      reload();
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
    setMinReloadGap(ms) {
      minReloadGapMs = ms;
    },
    reset() {
      if (pendingReload !== null) deps.clearTimer(pendingReload);
      pendingReload = null;
      lastReloadAt = Number.NEGATIVE_INFINITY;
      loadedAt.clear();
      failures.clear();
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

/** Runs one round of the polled query `key` and keeps its failure count. */
export async function trackPoll<T>(
  controller: PollController,
  key: QueryKey,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const keyHash = hashKey(key);
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (countsAsPollFailure(error, signal)) controller.recordFailure(keyHash);
    throw error;
  }
  controller.recordSuccess(keyHash);
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
      key,
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
  /**
   * Value for `refetchInterval` of the polled query `key`: the base, backed off after that
   * query's own failures, or `false` while the base is not known.
   */
  intervalFor: (key: QueryKey) => number | false;
  /** The most failures in a row of any one polled query. */
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
 * settings answer, never from a `NEXT_PUBLIC_` variable. A query that keeps failing backs off on
 * its own; the others keep the base interval.
 */
export function usePollingInterval(controller: PollController = pollController): PollingInterval {
  const settings = useSettings();
  const { failures } = usePollSnapshot(controller);
  const baseMs = settings.data?.client.pollIntervalMs ?? null;
  const intervalFor = useCallback(
    (key: QueryKey) => pollingIntervalOf(baseMs, controller.failuresOf(hashKey(key))),
    [baseMs, controller],
  );
  return {
    baseMs,
    intervalFor,
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
  const { baseMs } = usePollingInterval(controller);
  useEffect(() => {
    if (baseMs !== null) controller.setMinReloadGap(baseMs);
  }, [baseMs, controller]);
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

/**
 * State after a first-page load. On a reload (tab shown again, connection back) the fresh first
 * page is merged into what is loaded: the rows of later pages, the next-page cursor and the
 * reader's place stay. The cursor never moves back.
 */
export function contactListFromPage(
  page: ContactsPage,
  previous: ContactListState | undefined,
): ContactListState {
  if (previous === undefined) {
    return {
      items: page.contacts,
      counts: page.counts,
      lineConfigured: page.lineConfigured,
      before: page.before,
      hasMore: page.hasMore,
      cursor: page.highWater,
    };
  }
  // More rows than one page: later pages were loaded, and their keyset cursor still holds.
  const pagedFurther = previous.items.length > page.contacts.length;
  return {
    items: mergeById(previous.items, page.contacts),
    counts: page.counts,
    lineConfigured: page.lineConfigured,
    before: pagedFurther ? previous.before : page.before,
    hasMore: pagedFurther ? previous.hasMore : page.hasMore,
    cursor: advanceCursor(previous.cursor, page.highWater),
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
  const { intervalFor } = usePollingInterval();
  const key = qk.contacts(params);
  return useQuery({
    queryKey: key,
    queryFn: polledQueryFn<ContactListState>(key, ({ reload, getState, signal }) =>
      loadContactList({ params, reload, getState, fetchPage: listContacts, signal }),
    ),
    enabled: options.enabled ?? true,
    staleTime: 0,
    retry: 0,
    refetchInterval: (query) => intervalFor(query.queryKey),
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

/**
 * `lineConfigured` of the contact list updated most recently, whatever its filter; `true` until a
 * list has loaded. Reads the cache only, so the open chat does not poll a list of its own.
 */
export function latestLineConfigured(client: QueryClient): boolean {
  let latest: { at: number; value: boolean } | undefined;
  for (const query of client.getQueryCache().findAll({ queryKey: qkAll.contacts })) {
    const data = query.state.data as ContactListState | undefined; // every qk.contacts value is a ContactListState
    if (data === undefined) continue;
    if (latest === undefined || query.state.dataUpdatedAt > latest.at) {
      latest = { at: query.state.dataUpdatedAt, value: data.lineConfigured };
    }
  }
  return latest?.value ?? true;
}

/** Whether LINE is set up, from whichever contact list is current; no request of its own. */
export function useLineConfigured(): boolean {
  const client = useQueryClient();
  return useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => latestLineConfigured(client),
    () => true,
  );
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
