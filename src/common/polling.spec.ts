import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ContactsPage, type ListContactsParams } from '@/common/common.api';
import { POLL_BACKOFF_MAX_MS, POLL_FAILURES_BEFORE_BANNER } from '@/common/common.constants';
import { qk } from '@/common/query-keys';
import { POLL_OVERLAP_SEQ, type ContactDto } from '@/contracts';

import {
  appendContactPage,
  applyContactPoll,
  contactListFromPage,
  countsAsPollFailure,
  createPollController,
  latestContactCounts,
  loadContactList,
  mergeContactIntoList,
  mergeContactIntoLists,
  polledQueryFn,
  pollingIntervalOf,
  reloadPolledQueries,
  trackPoll,
  type ContactListState,
} from './polling';

const contact = (id: string, updatedSeq: string, over: Partial<ContactDto> = {}): ContactDto => ({
  id,
  displayName: `name ${id}`,
  pictureUrl: null,
  followStatus: 'following',
  followedAt: null,
  aiEnabled: true,
  needsAdmin: false,
  needsAdminReason: null,
  aiReplying: false,
  unreadCount: 0,
  lastMessage: null,
  createdAt: '2026-11-18T07:00:00.000Z',
  updatedSeq,
  ...over,
});

const page = (over: Partial<ContactsPage> = {}): ContactsPage => ({
  contacts: [],
  before: null,
  hasMore: false,
  highWater: '0',
  counts: { all: 0, unread: 0, needsAdmin: 0 },
  lineConfigured: true,
  ...over,
});

const state = (over: Partial<ContactListState> = {}): ContactListState => ({
  items: [],
  counts: { all: 0, unread: 0, needsAdmin: 0 },
  lineConfigured: true,
  before: null,
  hasMore: false,
  cursor: '0',
  ...over,
});

const signal = new AbortController().signal;
const network = (): ApiError => new ApiError('client.network', 0);

describe('poll controller', () => {
  it('counts failures and resets them on success', () => {
    const c = createPollController();
    c.recordFailure();
    c.recordFailure();
    expect(c.getSnapshot().failures).toBe(2);
    c.recordSuccess();
    expect(c.getSnapshot().failures).toBe(0);
  });

  it('asks every list to reload once the connection is back, not on a plain success', () => {
    const c = createPollController();
    const reload = vi.fn();
    c.setReloadHandler(reload);
    c.recordSuccess();
    expect(reload).not.toHaveBeenCalled();
    expect(c.getSnapshot().generation).toBe(0);
    c.recordFailure();
    c.recordSuccess();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().generation).toBe(1);
  });

  it('marks every list stale when the tab is shown again', () => {
    const c = createPollController();
    const reload = vi.fn();
    c.setReloadHandler(reload);
    c.markLoaded('k', 0);
    expect(c.needsReload('k')).toBe(false);
    c.requestReload();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(c.needsReload('k')).toBe(true);
    c.markLoaded('k', c.getSnapshot().generation);
    expect(c.needsReload('k')).toBe(false);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const c = createPollController();
    const listener = vi.fn();
    const off = c.subscribe(listener);
    c.recordFailure();
    off();
    c.recordFailure();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reset forgets failures, generation and loaded lists', () => {
    const c = createPollController();
    c.recordFailure();
    c.requestReload();
    c.markLoaded('k', 1);
    c.reset();
    expect(c.getSnapshot()).toEqual({ failures: 0, generation: 0 });
    expect(c.needsReload('k')).toBe(true);
  });
});

describe('failure accounting', () => {
  it('counts network, 5xx, broken answers and unknown errors, not 4xx or cancels', () => {
    expect(countsAsPollFailure(network())).toBe(true);
    expect(countsAsPollFailure(new ApiError('internal.unexpected', 500))).toBe(true);
    expect(countsAsPollFailure(new ApiError('internal.unexpected', 200))).toBe(true);
    expect(countsAsPollFailure(new Error('x'))).toBe(true);
    expect(countsAsPollFailure(new ApiError('contact.not_found', 404))).toBe(false);
    const aborted = new AbortController();
    aborted.abort();
    expect(countsAsPollFailure(network(), aborted.signal)).toBe(false);
  });

  it('trackPoll records a failure and rethrows, and records a success', async () => {
    const c = createPollController();
    await expect(trackPoll(c, () => Promise.reject(network()))).rejects.toBeInstanceOf(ApiError);
    expect(c.getSnapshot().failures).toBe(1);
    await expect(trackPoll(c, () => Promise.resolve(7))).resolves.toBe(7);
    expect(c.getSnapshot().failures).toBe(0);
  });

  it('a 4xx round neither counts as a failure nor clears the counter', async () => {
    const c = createPollController();
    c.recordFailure();
    await trackPoll(c, () => Promise.reject(new ApiError('contact.not_found', 404))).catch(
      () => undefined,
    );
    expect(c.getSnapshot().failures).toBe(1);
  });
});

describe('pollingIntervalOf', () => {
  it('does not poll until the interval from the settings is known', () => {
    expect(pollingIntervalOf(null, 0)).toBe(false);
  });

  it('uses the base, then doubles per failure up to the maximum', () => {
    expect(pollingIntervalOf(2000, 0)).toBe(2000);
    expect(pollingIntervalOf(2000, 1)).toBe(2000);
    expect(pollingIntervalOf(2000, 2)).toBe(4000);
    expect(pollingIntervalOf(2000, 3)).toBe(8000);
    expect(pollingIntervalOf(2000, 20)).toBe(POLL_BACKOFF_MAX_MS);
  });

  it('the banner threshold is the documented one', () => {
    expect(POLL_FAILURES_BEFORE_BANNER).toBe(2);
  });
});

describe('contact list transitions', () => {
  it('a first page sets the cursor to highWater', () => {
    const s = contactListFromPage(
      page({ contacts: [contact('a', '3')], highWater: '9' }),
      undefined,
    );
    expect(s.cursor).toBe('9');
    expect(s.items.map((c) => c.id)).toEqual(['a']);
  });

  it('a reload replaces the rows but never moves the cursor back', () => {
    const previous = state({ items: [contact('old', '1')], cursor: '50' });
    const s = contactListFromPage(
      page({ contacts: [contact('a', '3')], highWater: '40' }),
      previous,
    );
    expect(s.items.map((c) => c.id)).toEqual(['a']);
    expect(s.cursor).toBe('50');
  });

  it('a poll merges by id (higher updatedSeq wins), takes the latest counts and keeps paging', () => {
    const s = state({ items: [contact('a', '5'), contact('b', '6')], before: 'p2', hasMore: true });
    const next = applyContactPoll(
      s,
      page({
        contacts: [
          contact('a', '4', { displayName: 'stale' }),
          contact('b', '8', { unreadCount: 2 }),
          contact('c', '9'),
        ],
        highWater: '9',
        counts: { all: 3, unread: 1, needsAdmin: 0 },
        lineConfigured: false,
        hasMore: false,
        before: null,
      }),
    );
    expect(next.items.map((c) => [c.id, c.updatedSeq])).toEqual([
      ['a', '5'],
      ['b', '8'],
      ['c', '9'],
    ]);
    expect(next.counts.unread).toBe(1);
    expect(next.lineConfigured).toBe(false);
    expect(next.cursor).toBe('9');
    expect(next.before).toBe('p2');
    expect(next.hasMore).toBe(true);
  });

  it('a poll never moves the cursor back', () => {
    expect(applyContactPoll(state({ cursor: '20' }), page({ highWater: '7' })).cursor).toBe('20');
  });

  it('the next page appends and moves paging, not the cursor', () => {
    const next = appendContactPage(
      state({ items: [contact('a', '5')], cursor: '30', before: 'p2', hasMore: true }),
      page({ contacts: [contact('b', '2')], before: null, hasMore: false, highWater: '99' }),
    );
    expect(next.items.map((c) => c.id)).toEqual(['a', 'b']);
    expect(next.cursor).toBe('30');
    expect(next.before).toBeNull();
    expect(next.hasMore).toBe(false);
  });

  it('a contact from a mutation replaces an older row', () => {
    const next = mergeContactIntoList(
      state({ items: [contact('a', '5')] }),
      contact('a', '6', { unreadCount: 0 }),
    );
    expect(next.items[0]?.updatedSeq).toBe('6');
  });
});

describe('loadContactList', () => {
  const params = { filter: 'unread', q: 'ma' } as const;

  it('loads the first page with the filter and search', async () => {
    const fetchPage = vi.fn<(p: ListContactsParams) => Promise<ContactsPage>>(() =>
      Promise.resolve(page({ contacts: [contact('a', '1')], highWater: '12' })),
    );
    const s = await loadContactList({
      params,
      reload: false,
      getState: () => undefined,
      fetchPage,
      signal,
    });
    expect(fetchPage).toHaveBeenCalledWith({ filter: 'unread', q: 'ma' }, signal);
    expect(s.cursor).toBe('12');
  });

  it('polls with afterUpdatedSeq = pollAfter(cursor) and moves the cursor forward', async () => {
    const start = state({ cursor: '100' });
    const fetchPage = vi.fn<(p: ListContactsParams) => Promise<ContactsPage>>(() =>
      Promise.resolve(page({ highWater: '120' })),
    );
    const s = await loadContactList({
      params,
      reload: false,
      getState: () => start,
      fetchPage,
      signal,
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(
      { afterUpdatedSeq: String(100 - POLL_OVERLAP_SEQ) },
      signal,
    );
    expect(s.cursor).toBe('120');
  });

  it('asks the next round at once while hasMore is true, each from the new cursor', async () => {
    const start = state({ cursor: '100' });
    const answers = [
      page({ contacts: [contact('a', '110')], highWater: '110', hasMore: true }),
      page({ contacts: [contact('b', '130')], highWater: '130', hasMore: true }),
      page({ contacts: [contact('c', '140')], highWater: '140', hasMore: false }),
    ];
    const fetchPage = vi.fn<(p: ListContactsParams) => Promise<ContactsPage>>(() =>
      Promise.resolve(answers.shift() ?? page()),
    );
    const s = await loadContactList({
      params,
      reload: false,
      getState: () => start,
      fetchPage,
      signal,
    });
    expect(fetchPage.mock.calls.map(([p]) => p)).toEqual([
      { afterUpdatedSeq: String(100 - POLL_OVERLAP_SEQ) },
      { afterUpdatedSeq: String(110 - POLL_OVERLAP_SEQ) },
      { afterUpdatedSeq: String(130 - POLL_OVERLAP_SEQ) },
    ]);
    expect(s.items.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(s.cursor).toBe('140');
  });

  it('stops when hasMore is true but the cursor does not move', async () => {
    const start = state({ cursor: '100' });
    const fetchPage = vi.fn<(p: ListContactsParams) => Promise<ContactsPage>>(() =>
      Promise.resolve(page({ highWater: '100', hasMore: true })),
    );
    await loadContactList({ params, reload: false, getState: () => start, fetchPage, signal });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('merges into the cache as it is when the answer arrives', async () => {
    let current = state({ cursor: '10', items: [contact('a', '5')] });
    const fetchPage = vi.fn<(p: ListContactsParams) => Promise<ContactsPage>>(() => {
      // A mutation wrote a newer row while the poll was in flight.
      current = mergeContactIntoList(current, contact('z', '11'));
      return Promise.resolve(page({ contacts: [contact('b', '12')], highWater: '12' }));
    });
    const s = await loadContactList({
      params,
      reload: false,
      getState: () => current,
      fetchPage,
      signal,
    });
    expect(s.items.map((c) => c.id)).toEqual(['a', 'z', 'b']);
  });

  it('a reload asks for the first page even with a cursor', async () => {
    const start = state({ cursor: '100', items: [contact('gone', '1')] });
    const fetchPage = vi.fn<(p: ListContactsParams) => Promise<ContactsPage>>(() =>
      Promise.resolve(page({ contacts: [contact('a', '2')], highWater: '150' })),
    );
    const s = await loadContactList({
      params,
      reload: true,
      getState: () => start,
      fetchPage,
      signal,
    });
    expect(fetchPage).toHaveBeenCalledWith({ filter: 'unread', q: 'ma' }, signal);
    expect(s.items.map((c) => c.id)).toEqual(['a']);
    expect(s.cursor).toBe('150');
  });
});

describe('polledQueryFn with a QueryClient', () => {
  const key = ['test-list'] as const;
  type S = { loads: string[] };

  function run(
    client: QueryClient,
    controller: ReturnType<typeof createPollController>,
    fail = false,
  ) {
    return client.query({
      queryKey: key,
      queryFn: polledQueryFn<S>(
        key,
        ({ reload, getState }) =>
          fail
            ? Promise.reject(network())
            : Promise.resolve({ loads: [...(getState()?.loads ?? []), reload ? 'first' : 'poll'] }),
        controller,
      ),
      staleTime: 0,
      retry: 0,
    });
  }

  it('loads the first page once, then polls, and reloads after the tab is shown again', async () => {
    const client = new QueryClient();
    const controller = createPollController();
    await run(client, controller);
    await run(client, controller);
    controller.requestReload();
    const s = await run(client, controller);
    expect(s.loads).toEqual(['first', 'poll', 'first']);
  });

  it('counts failed rounds and reloads after the first success that follows', async () => {
    const client = new QueryClient();
    const controller = createPollController();
    const reload = vi.fn();
    controller.setReloadHandler(reload);
    await run(client, controller);
    await run(client, controller, true).catch(() => undefined);
    await run(client, controller, true).catch(() => undefined);
    expect(controller.getSnapshot().failures).toBe(POLL_FAILURES_BEFORE_BANNER);
    await run(client, controller);
    expect(controller.getSnapshot().failures).toBe(0);
    expect(reload).toHaveBeenCalledTimes(1);
    // The success bumped the generation, so the next round loads the first page.
    expect((await run(client, controller)).loads.at(-1)).toBe('first');
  });
});

describe('cache helpers', () => {
  it('mergeContactIntoLists writes into every contact list', () => {
    const client = new QueryClient();
    client.setQueryData(
      qk.contacts({ filter: 'all', q: '' }),
      state({ items: [contact('a', '1')] }),
    );
    client.setQueryData(qk.contacts({ filter: 'unread', q: '' }), state());
    mergeContactIntoLists(client, contact('a', '2'));
    const all = client.getQueryData<ContactListState>(qk.contacts({ filter: 'all', q: '' }));
    const unread = client.getQueryData<ContactListState>(qk.contacts({ filter: 'unread', q: '' }));
    expect(all?.items[0]?.updatedSeq).toBe('2');
    expect(unread?.items.map((c) => c.id)).toEqual(['a']);
  });

  it('latestContactCounts reads the list updated most recently', () => {
    vi.useFakeTimers();
    try {
      const client = new QueryClient();
      expect(latestContactCounts(client)).toBeUndefined();
      vi.setSystemTime(1000);
      client.setQueryData(
        qk.contacts({ filter: 'all', q: '' }),
        state({ counts: { all: 5, unread: 1, needsAdmin: 0 } }),
      );
      vi.setSystemTime(2000);
      client.setQueryData(
        qk.contacts({ filter: 'needs_admin', q: '' }),
        state({ counts: { all: 5, unread: 3, needsAdmin: 2 } }),
      );
      expect(latestContactCounts(client)?.unread).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloadPolledQueries invalidates the polled lists, and settings when they never loaded', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    reloadPolledQueries(client);
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ['contacts'],
      ['messages'],
      ['contact'],
      ['settings'],
    ]);
    spy.mockClear();
    client.setQueryData(qk.settings(), {});
    reloadPolledQueries(client);
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ['contacts'],
      ['messages'],
      ['contact'],
    ]);
  });
});
