// Pure transitions of the thread cache `qk.messages(id)`: the optimistic send state machine
// (ui-screens 7.5) and the polling merges of the thread (ui-screens 7.3). `inbox.hooks.ts` (send)
// and `thread/inbox.thread.hooks.ts` (thread) wire them to TanStack Query; nothing here reads the
// clock, makes ids or does I/O.
import { errorCodeOf } from '@/common/common.api';
import { advanceCursor, pollAfter } from '@/common/common.logic';
import type { ErrorMessageCode } from '@/common/error-messages';
import type { MessageDto, SendMessageBody } from '@/contracts';

import type { MessagesPage } from './inbox.api';
import { mergeThread, sortMessages, type ThreadMessage } from './inbox.logic';

// ---------------------------------------------------------------------------
// Thread cache (ui-screens 7.3)
// ---------------------------------------------------------------------------

export type ThreadState = { items: ThreadMessage[]; hasOlder: boolean; cursor: string };

/** A row the server does not have yet, or one with a send or retry of this tab in progress. */
function isLocalRow(row: ThreadMessage): boolean {
  return row.seq === null || row.localState !== undefined;
}

/**
 * State after loading the latest page. On a reload the server rows are replaced, while rows that
 * have no `seq` yet (being sent) are kept and merged back. The cursor never moves back.
 */
export function threadFromFirstPage(
  page: MessagesPage,
  previous: ThreadState | undefined,
): ThreadState {
  const kept = previous === undefined ? [] : previous.items.filter(isLocalRow);
  return {
    items: mergeThread(kept, page.messages),
    hasOlder: page.hasOlder ?? false,
    cursor:
      previous === undefined ? page.highWater : advanceCursor(previous.cursor, page.highWater),
  };
}

/** Merges one polling answer: new rows and rows whose status changed. Same state when nothing did. */
export function applyThreadPoll(state: ThreadState, page: MessagesPage): ThreadState {
  const items = mergeThread(state.items, page.messages);
  const cursor = advanceCursor(state.cursor, page.highWater);
  return items === state.items && cursor === state.cursor ? state : { ...state, items, cursor };
}

/** Merges a `beforeSeq` page. The polling cursor is untouched. */
export function applyOlderPage(state: ThreadState, page: MessagesPage): ThreadState {
  return {
    ...state,
    items: mergeThread(state.items, page.messages),
    hasOlder: page.hasOlder ?? false,
  };
}

export type FetchMessages = (
  params: { beforeSeq?: string; afterUpdatedSeq?: string },
  signal: AbortSignal,
) => Promise<MessagesPage>;

/**
 * One load of a thread: the latest page, or a polling round that asks again at once while
 * `hasMore` is true (stops if the cursor does not move). Merges into the cache as it is when the
 * answer arrives, so a message sent meanwhile is not lost.
 */
export async function loadThread(deps: {
  reload: boolean;
  getState: () => ThreadState | undefined;
  fetchPage: FetchMessages;
  signal: AbortSignal;
}): Promise<ThreadState> {
  const { signal } = deps;
  const start = deps.getState();
  if (deps.reload || start === undefined) {
    const page = await deps.fetchPage({}, signal);
    return threadFromFirstPage(page, deps.getState());
  }
  const pages: MessagesPage[] = [];
  let cursor = start.cursor;
  for (;;) {
    const page = await deps.fetchPage({ afterUpdatedSeq: pollAfter(cursor) }, signal);
    pages.push(page);
    const next = advanceCursor(cursor, page.highWater);
    if (!page.hasMore || next === cursor) break;
    cursor = next;
  }
  return pages.reduce(applyThreadPoll, deps.getState() ?? start);
}

// ---------------------------------------------------------------------------
// Optimistic send (ui-screens 7.5)
// ---------------------------------------------------------------------------

export type SendInput =
  | { kind: 'text'; text: string }
  | {
      kind: 'image';
      uploadId: string;
      contentType: 'image/jpeg' | 'image/png';
      localPreviewUrl?: string;
    }
  | { kind: 'video'; uploadId: string; contentType: 'video/mp4'; localPreviewUrl?: string };

/** Body of POST /api/contacts/:id/messages. Text loses only its leading and trailing blank space. */
export function buildSendBody(id: string, input: SendInput): SendMessageBody {
  switch (input.kind) {
    case 'text':
      return { id, kind: 'text', text: input.text.trim() };
    case 'image':
      return { id, kind: 'image', uploadId: input.uploadId, contentType: input.contentType };
    case 'video':
      return { id, kind: 'video', uploadId: input.uploadId, contentType: input.contentType };
  }
}

/** The bubble shown from the moment the admin presses send (`sending`). */
export function optimisticMessage(
  contactId: string,
  body: SendMessageBody,
  createdAt: string,
  localPreviewUrl?: string,
): ThreadMessage {
  const message: ThreadMessage = {
    id: body.id,
    seq: null,
    updatedSeq: null,
    contactId,
    direction: 'outbound',
    author: 'admin',
    type: body.kind,
    text: body.kind === 'text' ? body.text : null,
    media: body.kind === 'text' ? null : { status: 'pending', url: null, previewUrl: null },
    sticker: null,
    otherKind: null,
    eventCode: null,
    delivery: { status: 'pending', errorCode: null },
    createdAt,
    sentAt: null,
    localState: 'sending',
  };
  return localPreviewUrl === undefined ? message : { ...message, localPreviewUrl };
}

/** Body to send again for a failed row that never reached the server, when only the row is left. */
export function bodyFromRow(row: ThreadMessage): SendMessageBody | null {
  return row.type === 'text' && row.text !== null && row.text.trim() !== ''
    ? { id: row.id, kind: 'text', text: row.text }
    : null;
}

export type SendEvent =
  /** Send pressed: the optimistic row goes in. */
  | { type: 'started'; message: ThreadMessage }
  /** "Send again" pressed on a failed row. */
  | { type: 'resent'; id: string }
  /** The server answered with the message (`delivery` sent, failed or still pending). */
  | { type: 'answered'; message: MessageDto }
  /** The call failed: an error code from the server, or `client.network` without an answer. */
  | { type: 'rejected'; id: string; code: ErrorMessageCode }
  /** `SEND_UNCONFIRMED_TIMEOUT_MS` passed after a send without an answer. */
  | { type: 'timedOut'; id: string };

function withoutLocal(row: ThreadMessage): ThreadMessage {
  const next = { ...row };
  delete next.localState;
  delete next.localError;
  return next;
}

function updateRow(
  items: readonly ThreadMessage[],
  id: string,
  change: (row: ThreadMessage) => ThreadMessage,
): ThreadMessage[] {
  const at = items.findIndex((row) => row.id === id);
  const row = items[at];
  if (row === undefined) return items as ThreadMessage[]; // unchanged input back, as mergeThread does
  const updated = change(row);
  if (updated === row) return items as ThreadMessage[]; // unchanged input back, as mergeThread does
  const next = [...items];
  next[at] = updated;
  return next;
}

/** Applies one event of the send state machine to the thread rows. */
export function applySendEvent(items: readonly ThreadMessage[], event: SendEvent): ThreadMessage[] {
  switch (event.type) {
    case 'started':
      // The same id twice (a double press) never makes a second bubble.
      if (items.some((row) => row.id === event.message.id)) return items as ThreadMessage[]; // unchanged
      return sortMessages([...items, event.message]);

    case 'resent':
      return updateRow(items, event.id, (row) => ({
        ...withoutLocal(row),
        localState: 'sending',
      }));

    case 'answered': {
      const current = items.find((row) => row.id === event.message.id);
      // The answer is the version already shown (a retry of a pending send): drop the overlay.
      if (current !== undefined && current.updatedSeq === event.message.updatedSeq) {
        return updateRow(items, current.id, (row) =>
          row.localState === undefined ? row : withoutLocal(row),
        );
      }
      return mergeThread(items, [event.message]);
    }

    case 'rejected':
      return updateRow(items, event.id, (row) => {
        if (row.localState !== 'sending') return row; // polling already settled it
        if (event.code === 'client.network') return { ...row, localState: 'unconfirmed' };
        // The server says it is already sent or being sent: show the server state.
        if (event.code === 'message.not_retryable') return withoutLocal(row);
        return { ...row, localState: 'failed', localError: event.code };
      });

    case 'timedOut':
      return updateRow(items, event.id, (row) =>
        row.localState === 'unconfirmed'
          ? { ...row, localState: 'failed', localError: 'client.network' }
          : row,
      );
  }
}

/** The event for a send or retry call that threw (`client.network` makes the row unconfirmed). */
export function failureEvent(id: string, error: unknown): Extract<SendEvent, { type: 'rejected' }> {
  return { type: 'rejected', id, code: errorCodeOf(error) };
}

/**
 * Id of a send still waiting for the same upload. One upload is one message, so pressing send
 * again for the same file reuses it instead of making a second message.
 */
export function pendingSendOfUpload(
  outbox: ReadonlyMap<string, SendMessageBody>,
  input: SendInput,
): string | null {
  if (input.kind === 'text') return null;
  for (const [id, body] of outbox) {
    if (body.kind !== 'text' && body.uploadId === input.uploadId) return id;
  }
  return null;
}

export type RetryPlan =
  /** The server has the row (`seq`): POST .../retry, which reuses the retry key. */
  | 'retry'
  /** The server may not have it: POST .../messages again with the same id and content. */
  | 'resend'
  /** Nothing to do: in flight, or not failed. */
  | null;

/** What "send again" does for a row (ui-screens 7.5 rows "failed → sending"). */
export function retryPlan(row: ThreadMessage): RetryPlan {
  if (row.localState === 'sending' || row.localState === 'unconfirmed') return null;
  if (row.seq === null) return row.localState === 'failed' ? 'resend' : null;
  return row.localState === 'failed' || row.delivery?.status === 'failed' ? 'retry' : null;
}

export type OutgoingStatus = {
  status: 'pending' | 'sent' | 'failed' | 'none';
  /** Error code for the failure text (`errorMessage`). */
  code: string | null;
};

/** Delivery status for the bubble (`data-status`): local state first, then the server's. */
export function outgoingStatus(row: ThreadMessage): OutgoingStatus {
  switch (row.localState) {
    case 'sending':
    case 'unconfirmed':
      return { status: 'pending', code: null };
    case 'failed':
      return { status: 'failed', code: row.localError ?? null };
    case undefined:
      break;
  }
  if (row.delivery === null) return { status: 'none', code: null };
  return {
    status: row.delivery.status,
    code: row.delivery.status === 'failed' ? row.delivery.errorCode : null,
  };
}
