import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/common/common.api';
import { POLL_OVERLAP_SEQ, type MessageDto, type SendMessageBody } from '@/contracts';

import type { MessagesPage } from './inbox.api';
import { mergeThread, type ThreadMessage } from './inbox.logic';
import {
  applyOlderPage,
  applySendEvent,
  applyThreadPoll,
  bodyFromRow,
  buildSendBody,
  failureEvent,
  loadThread,
  optimisticMessage,
  outgoingStatus,
  pendingSendOfUpload,
  isRetryExpired,
  retryPlan,
  threadFromFirstPage,
  type ThreadState,
} from './inbox.send.logic';

const ID = '019a0000-0000-7000-8000-000000000001';
const CONTACT = 'contact-1';
const NOW = '2026-11-18T07:30:00.000Z';
/** The browser clock of the retryPlan cases. */
const CLOCK = new Date('2026-11-19T05:00:00.000Z');

const server = (over: Partial<MessageDto> & { id: string; seq: string }): MessageDto => ({
  updatedSeq: over.seq,
  contactId: CONTACT,
  direction: 'outbound',
  author: 'admin',
  type: 'text',
  text: 'hello',
  media: null,
  sticker: null,
  otherKind: null,
  eventCode: null,
  quote: null,
  delivery: { status: 'sent', errorCode: null, retryExpiresAt: null },
  createdAt: '2026-11-18T07:00:00.000Z',
  sentAt: null,
  ...over,
});

const inbound = (id: string, seq: string): MessageDto =>
  server({ id, seq, direction: 'inbound', author: 'customer', delivery: null });

const page = (over: Partial<MessagesPage> = {}): MessagesPage => ({
  messages: [],
  hasOlder: false,
  hasMore: false,
  highWater: '0',
  ...over,
});

const textBody = buildSendBody(ID, { kind: 'text', text: '  สวัสดีค่ะ\n\n' });
const sending = (): ThreadMessage => optimisticMessage(CONTACT, textBody, NOW);

/** Applies the "started" event to a thread that already has one inbound message. */
const started = (): ThreadMessage[] =>
  applySendEvent([inbound('in-1', '5')], { type: 'started', message: sending() });

const row = (items: readonly ThreadMessage[], id = ID): ThreadMessage => {
  const found = items.find((m) => m.id === id);
  if (found === undefined) throw new Error(`no row ${id}`);
  return found;
};

describe('send body and optimistic bubble', () => {
  it('trims only the leading and trailing blank space of the text', () => {
    expect(buildSendBody(ID, { kind: 'text', text: '  a\n b \n' })).toEqual({
      id: ID,
      kind: 'text',
      text: 'a\n b',
    });
  });

  it('builds media bodies with uploadId and contentType', () => {
    expect(
      buildSendBody(ID, { kind: 'image', uploadId: 'u'.repeat(22), contentType: 'image/png' }),
    ).toEqual({ id: ID, kind: 'image', uploadId: 'u'.repeat(22), contentType: 'image/png' });
    expect(
      buildSendBody(ID, { kind: 'video', uploadId: 'v'.repeat(22), contentType: 'video/mp4' }),
    ).toEqual({ id: ID, kind: 'video', uploadId: 'v'.repeat(22), contentType: 'video/mp4' });
  });

  it('the optimistic row has no seq, admin outbound pending delivery and localState sending', () => {
    expect(sending()).toMatchObject({
      id: ID,
      seq: null,
      updatedSeq: null,
      author: 'admin',
      direction: 'outbound',
      delivery: { status: 'pending', errorCode: null, retryExpiresAt: null },
      localState: 'sending',
      createdAt: NOW,
      text: 'สวัสดีค่ะ',
    });
  });

  it('a media row keeps its local preview', () => {
    const body = buildSendBody(ID, {
      kind: 'image',
      uploadId: 'u'.repeat(22),
      contentType: 'image/jpeg',
    });
    const message = optimisticMessage(CONTACT, body, NOW, 'blob:preview');
    expect(message).toMatchObject({ type: 'image', text: null, localPreviewUrl: 'blob:preview' });
    expect(message.media).toEqual({ status: 'pending', url: null, previewUrl: null });
  });

  it('bodyFromRow rebuilds a text body and gives null for media', () => {
    expect(bodyFromRow(sending())).toEqual({ id: ID, kind: 'text', text: 'สวัสดีค่ะ' });
    const body = buildSendBody(ID, {
      kind: 'video',
      uploadId: 'v'.repeat(22),
      contentType: 'video/mp4',
    });
    expect(bodyFromRow(optimisticMessage(CONTACT, body, NOW))).toBeNull();
  });
});

// One test per row of the transition table in ui-screens 7.5.
describe('send state machine (ui-screens 7.5)', () => {
  it('(none) → sending: the row goes after the server rows', () => {
    const items = started();
    expect(items.map((m) => m.id)).toEqual(['in-1', ID]);
    expect(row(items).localState).toBe('sending');
  });

  it('a second "started" with the same id does not add a second bubble', () => {
    const items = started();
    expect(applySendEvent(items, { type: 'started', message: sending() })).toBe(items);
  });

  it('sending → sent: replaced by the server row with seq and updatedSeq', () => {
    const items = applySendEvent(started(), {
      type: 'answered',
      message: server({ id: ID, seq: '7', text: 'สวัสดีค่ะ' }),
    });
    const sent = row(items);
    expect(sent.seq).toBe('7');
    expect(sent.updatedSeq).toBe('7');
    expect(sent.localState).toBeUndefined();
    expect(outgoingStatus(sent)).toEqual({ status: 'sent', code: null });
  });

  it('sending → failed by the server: replaced with the server row and its errorCode', () => {
    const items = applySendEvent(started(), {
      type: 'answered',
      message: server({
        id: ID,
        seq: '7',
        delivery: { status: 'failed', errorCode: 'line.push_failed', retryExpiresAt: null },
      }),
    });
    expect(row(items).localState).toBeUndefined();
    expect(outgoingStatus(row(items))).toEqual({ status: 'failed', code: 'line.push_failed' });
  });

  it('sending → failed on an API error with a code; the text stays', () => {
    const items = applySendEvent(started(), {
      type: 'rejected',
      id: ID,
      code: 'message.rate_limited',
    });
    expect(row(items)).toMatchObject({
      localState: 'failed',
      localError: 'message.rate_limited',
      text: 'สวัสดีค่ะ',
    });
    expect(outgoingStatus(row(items))).toEqual({ status: 'failed', code: 'message.rate_limited' });
  });

  it('sending → failed when the answer broke the schema (internal.unexpected)', () => {
    const items = applySendEvent(started(), {
      type: 'rejected',
      id: ID,
      code: 'internal.unexpected',
    });
    expect(row(items).localState).toBe('failed');
  });

  it('sending → unconfirmed without an answer; still shown as sending', () => {
    const items = applySendEvent(started(), { type: 'rejected', id: ID, code: 'client.network' });
    expect(row(items).localState).toBe('unconfirmed');
    expect(outgoingStatus(row(items)).status).toBe('pending');
  });

  it('unconfirmed → server state when polling finds the same id', () => {
    const unconfirmed = applySendEvent(started(), {
      type: 'rejected',
      id: ID,
      code: 'client.network',
    });
    const items = mergeThread(unconfirmed, [server({ id: ID, seq: '9' })]);
    expect(row(items).localState).toBeUndefined();
    expect(row(items).seq).toBe('9');
  });

  it('unconfirmed → failed with client.network when the time is up', () => {
    const unconfirmed = applySendEvent(started(), {
      type: 'rejected',
      id: ID,
      code: 'client.network',
    });
    const items = applySendEvent(unconfirmed, { type: 'timedOut', id: ID });
    expect(row(items)).toMatchObject({ localState: 'failed', localError: 'client.network' });
  });

  it('the timeout does nothing once polling has settled the row', () => {
    const unconfirmed = applySendEvent(started(), {
      type: 'rejected',
      id: ID,
      code: 'client.network',
    });
    const settled = mergeThread(unconfirmed, [server({ id: ID, seq: '9' })]);
    expect(applySendEvent(settled, { type: 'timedOut', id: ID })).toBe(settled);
  });

  it('failed with seq → sending through retry (the server knows the row)', () => {
    const failed = mergeThread(started(), [
      server({
        id: ID,
        seq: '7',
        delivery: { status: 'failed', errorCode: 'line.unavailable', retryExpiresAt: null },
      }),
    ]);
    expect(retryPlan(row(failed), CLOCK)).toBe('retry');
    const items = applySendEvent(failed, { type: 'resent', id: ID });
    expect(row(items).localState).toBe('sending');
    expect(retryPlan(row(items), CLOCK)).toBeNull();
    const done = applySendEvent(items, {
      type: 'answered',
      message: server({ id: ID, seq: '7', updatedSeq: '12' }),
    });
    expect(outgoingStatus(row(done))).toEqual({ status: 'sent', code: null });
  });

  it('failed without seq → sending through a resend with the same id', () => {
    const failed = applySendEvent(started(), {
      type: 'rejected',
      id: ID,
      code: 'internal.unexpected',
    });
    expect(retryPlan(row(failed), CLOCK)).toBe('resend');
    const items = applySendEvent(failed, { type: 'resent', id: ID });
    expect(row(items).localState).toBe('sending');
    expect(row(items).localError).toBeUndefined();
    expect(items.filter((m) => m.id === ID)).toHaveLength(1);
  });

  it('any state → server state when polling returns the row (server wins with updatedSeq)', () => {
    for (const localState of ['sending', 'unconfirmed', 'failed'] as const) {
      const items: ThreadMessage[] = [{ ...sending(), localState }];
      const merged = mergeThread(items, [server({ id: ID, seq: '3' })]);
      expect(row(merged).localState).toBeUndefined();
      expect(row(merged).seq).toBe('3');
    }
  });

  it('an answer that repeats the version already shown drops the local overlay', () => {
    const shown = mergeThread(
      [],
      [
        server({
          id: ID,
          seq: '7',
          delivery: { status: 'failed', errorCode: 'line.unavailable', retryExpiresAt: null },
        }),
      ],
    );
    const retrying = applySendEvent(shown, { type: 'resent', id: ID });
    const items = applySendEvent(retrying, {
      type: 'answered',
      message: server({
        id: ID,
        seq: '7',
        delivery: { status: 'failed', errorCode: 'line.unavailable', retryExpiresAt: null },
      }),
    });
    expect(row(items).localState).toBeUndefined();
  });

  it('an older answer than the row from polling keeps the newer row', () => {
    const polled = mergeThread(started(), [server({ id: ID, seq: '7', updatedSeq: '15' })]);
    const items = applySendEvent(polled, {
      type: 'answered',
      message: server({
        id: ID,
        seq: '7',
        updatedSeq: '8',
        delivery: { status: 'pending', errorCode: null, retryExpiresAt: null },
      }),
    });
    expect(row(items).updatedSeq).toBe('15');
  });

  it('message.not_retryable on a retry shows the server state instead of a failure', () => {
    const failed = mergeThread(
      [],
      [
        server({
          id: ID,
          seq: '7',
          delivery: { status: 'failed', errorCode: 'line.unavailable', retryExpiresAt: null },
        }),
      ],
    );
    const retrying = applySendEvent(failed, { type: 'resent', id: ID });
    const items = applySendEvent(retrying, {
      type: 'rejected',
      id: ID,
      code: 'message.not_retryable',
    });
    expect(row(items).localState).toBeUndefined();
  });

  it('an error that arrives after polling settled the row is ignored', () => {
    const settled = mergeThread(started(), [server({ id: ID, seq: '7' })]);
    expect(applySendEvent(settled, { type: 'rejected', id: ID, code: 'internal.unexpected' })).toBe(
      settled,
    );
  });

  it('events for an unknown id change nothing', () => {
    const items = started();
    expect(applySendEvent(items, { type: 'resent', id: 'other' })).toBe(items);
    expect(applySendEvent(items, { type: 'timedOut', id: 'other' })).toBe(items);
  });

  it('retryPlan: no retry once the retry key window has passed, a retry just inside it', () => {
    const failedUntil = (retryExpiresAt: string) =>
      row(
        mergeThread(
          [],
          [
            server({
              id: ID,
              seq: '7',
              delivery: { status: 'failed', errorCode: 'line.push_failed', retryExpiresAt },
            }),
          ],
        ),
      );
    const end = CLOCK.getTime();
    const justInside = failedUntil(new Date(end + 1).toISOString());
    expect(isRetryExpired(justInside, CLOCK)).toBe(false);
    expect(retryPlan(justInside, CLOCK)).toBe('retry');
    const atEnd = failedUntil(new Date(end).toISOString());
    expect(isRetryExpired(atEnd, CLOCK)).toBe(true);
    expect(retryPlan(atEnd, CLOCK)).toBeNull();
    // The server's refusal counts as expired even before the browser's clock gets there.
    const refused = {
      ...justInside,
      localState: 'failed' as const,
      localError: 'message.retry_expired',
    };
    expect(isRetryExpired(refused, CLOCK)).toBe(true);
    expect(retryPlan(refused, CLOCK)).toBeNull();
  });

  it('retryPlan: nothing to do while in flight or when sent', () => {
    expect(retryPlan(sending(), CLOCK)).toBeNull();
    expect(retryPlan({ ...sending(), localState: 'unconfirmed' }, CLOCK)).toBeNull();
    const sent = row(mergeThread([], [server({ id: ID, seq: '7' })]));
    expect(retryPlan(sent, CLOCK)).toBeNull();
    const localNoState = { ...sending() };
    delete localNoState.localState;
    expect(retryPlan(localNoState, CLOCK)).toBeNull();
  });

  it('outgoingStatus: inbound rows have no delivery status', () => {
    expect(outgoingStatus(inbound('in', '1'))).toEqual({ status: 'none', code: null });
    expect(
      outgoingStatus(
        server({
          id: 'p',
          seq: '1',
          delivery: { status: 'pending', errorCode: null, retryExpiresAt: null },
        }),
      ),
    ).toEqual({
      status: 'pending',
      code: null,
    });
  });
});

describe('thread cache (ui-screens 7.3)', () => {
  const local = (): ThreadMessage => sending();

  it('a first page sets hasOlder and the cursor', () => {
    const s = threadFromFirstPage(
      page({ messages: [inbound('a', '4')], hasOlder: true, highWater: '9' }),
      undefined,
    );
    expect(s).toMatchObject({ hasOlder: true, cursor: '9' });
    expect(s.items.map((m) => m.id)).toEqual(['a']);
  });

  it('a reload merges the fresh page into the loaded rows, keeping older pages and hasOlder', () => {
    const previous: ThreadState = {
      items: [inbound('older', '1'), inbound('mid', '30'), inbound('a', '40'), local()],
      hasOlder: true,
      cursor: '50',
    };
    const s = threadFromFirstPage(
      page({
        messages: [inbound('mid', '30'), inbound('a', '40'), inbound('new', '48')],
        highWater: '49',
        hasOlder: true,
      }),
      previous,
    );
    expect(s.items.map((m) => m.id)).toEqual(['older', 'mid', 'a', 'new', ID]);
    expect(s.cursor).toBe('50');
    expect(s.hasOlder).toBe(true);
  });

  it('a reload whose page does not reach the loaded rows drops them, keeps rows being sent, never moves the cursor back', () => {
    const previous: ThreadState = {
      items: [inbound('old', '1'), local()],
      hasOlder: false,
      cursor: '50',
    };
    const s = threadFromFirstPage(
      page({ messages: [inbound('a', '40')], highWater: '45', hasOlder: true }),
      previous,
    );
    expect(s.items.map((m) => m.id)).toEqual(['a', ID]);
    expect(s.cursor).toBe('50');
    expect(s.hasOlder).toBe(true);
  });

  it('a poll merges rows and moves the cursor; nothing new gives the same state', () => {
    const s: ThreadState = { items: [inbound('a', '4')], hasOlder: true, cursor: '4' };
    const next = applyThreadPoll(
      s,
      page({ messages: [inbound('b', '6')], highWater: '6', hasOlder: null }),
    );
    expect(next.items.map((m) => m.id)).toEqual(['a', 'b']);
    expect(next.cursor).toBe('6');
    expect(next.hasOlder).toBe(true);
    expect(applyThreadPoll(next, page({ messages: [inbound('b', '6')], highWater: '6' }))).toBe(
      next,
    );
  });

  it('an older page merges in front and keeps the cursor', () => {
    const s: ThreadState = { items: [inbound('b', '10')], hasOlder: true, cursor: '20' };
    const next = applyOlderPage(
      s,
      page({ messages: [inbound('a', '3')], hasOlder: false, highWater: '0' }),
    );
    expect(next.items.map((m) => m.id)).toEqual(['a', 'b']);
    expect(next).toMatchObject({ hasOlder: false, cursor: '20' });
  });

  it('loadThread polls with pollAfter(cursor) and repeats at once while hasMore', async () => {
    let current: ThreadState | undefined = {
      items: [inbound('a', '100')],
      hasOlder: false,
      cursor: '100',
    };
    const answers = [
      page({ messages: [inbound('b', '110')], highWater: '110', hasMore: true, hasOlder: null }),
      page({ messages: [inbound('c', '115')], highWater: '115', hasMore: false, hasOlder: null }),
    ];
    const fetchPage = vi.fn<
      (p: { beforeSeq?: string; afterUpdatedSeq?: string }) => Promise<MessagesPage>
    >(() => {
      // A message is sent while the poll is in flight: it must survive the merge.
      if (current !== undefined)
        current = {
          ...current,
          items: applySendEvent(current.items, { type: 'started', message: local() }),
        };
      return Promise.resolve(answers.shift() ?? page());
    });
    const signal = new AbortController().signal;
    const s = await loadThread({ reload: false, getState: () => current, fetchPage, signal });
    expect(fetchPage.mock.calls.map(([p]) => p)).toEqual([
      { afterUpdatedSeq: String(100 - POLL_OVERLAP_SEQ) },
      { afterUpdatedSeq: String(110 - POLL_OVERLAP_SEQ) },
    ]);
    expect(s.items.map((m) => m.id)).toEqual(['a', 'b', 'c', ID]);
    expect(s.cursor).toBe('115');
  });

  it('loadThread loads the latest page on reload or without a state', async () => {
    const fetchPage = vi.fn<
      (p: { beforeSeq?: string; afterUpdatedSeq?: string }) => Promise<MessagesPage>
    >(() => Promise.resolve(page({ messages: [inbound('a', '1')], highWater: '1' })));
    const signal = new AbortController().signal;
    await loadThread({ reload: false, getState: () => undefined, fetchPage, signal });
    await loadThread({
      reload: true,
      getState: () => ({ items: [], hasOlder: false, cursor: '9' }),
      fetchPage,
      signal,
    });
    expect(fetchPage.mock.calls.map(([p]) => p)).toEqual([{}, {}]);
  });

  it('loadThread stops when hasMore is true but the cursor does not move', async () => {
    const fetchPage = vi.fn<
      (p: { beforeSeq?: string; afterUpdatedSeq?: string }) => Promise<MessagesPage>
    >(() => Promise.resolve(page({ highWater: '5', hasMore: true })));
    await loadThread({
      reload: false,
      getState: () => ({ items: [], hasOlder: false, cursor: '5' }),
      fetchPage,
      signal: new AbortController().signal,
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe('send helpers', () => {
  it('failureEvent maps no answer to client.network and unknown errors to internal.unexpected', () => {
    expect(failureEvent(ID, new ApiError('client.network', 0))).toEqual({
      type: 'rejected',
      id: ID,
      code: 'client.network',
    });
    expect(failureEvent(ID, new TypeError('x')).code).toBe('internal.unexpected');
    expect(failureEvent(ID, new ApiError('contact.unfollowed', 409)).code).toBe(
      'contact.unfollowed',
    );
  });

  it('pendingSendOfUpload reuses the id of a send of the same upload, never for text', () => {
    const uploadId = 'u'.repeat(22);
    const outbox = new Map<string, SendMessageBody>([
      ['t1', { id: 't1', kind: 'text', text: 'hi' }],
      ['m1', { id: 'm1', kind: 'image', uploadId, contentType: 'image/jpeg' }],
    ]);
    expect(
      pendingSendOfUpload(outbox, { kind: 'image', uploadId, contentType: 'image/jpeg' }),
    ).toBe('m1');
    expect(
      pendingSendOfUpload(outbox, {
        kind: 'video',
        uploadId: 'v'.repeat(22),
        contentType: 'video/mp4',
      }),
    ).toBeNull();
    expect(pendingSendOfUpload(outbox, { kind: 'text', text: 'hi' })).toBeNull();
  });
});
