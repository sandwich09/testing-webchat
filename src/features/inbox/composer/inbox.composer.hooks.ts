'use client';

// React hooks of the composer (ui-screens 5.7 to 5.10): the draft per chat, the attachment
// controller per chat, the release of sent previews and the typing ping. The state machines and
// throttles they wire are in `inbox.attachment.logic.ts`, `inbox.attachment.controller.ts` and
// `inbox.typing.controller.ts`.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';

import { qkAll } from '@/common/query-keys';

import { cancelUpload, notifyTyping, requestUpload, uploadToTarget } from '../inbox.api';
import { TYPING_PING_INTERVAL_MS } from '../inbox.constants';
import type { ThreadMessage } from '../inbox.logic';
import {
  createAttachmentController,
  type AttachmentController,
  type AttachmentDeps,
  type PickedFile,
} from './inbox.attachment.controller';
import {
  attachmentReducer,
  IDLE,
  previewsToRelease,
  type Attachment,
  type AttachmentEvent,
} from './inbox.attachment.logic';
import {
  buildPreviewImage,
  captureVideoFrame,
  convertHeicToJpeg,
  convertToJpeg,
  readHeadBytes,
} from './inbox.media';
import { createTypingPinger, type TypingPinger } from './inbox.typing.controller';

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

// ---------------------------------------------------------------------------
// Attachment (ui-screens 7.6)
// ---------------------------------------------------------------------------

function browserDeps(): AttachmentDeps {
  return {
    readHead: readHeadBytes,
    convertToJpeg: (file) => convertToJpeg(file),
    convertHeicToJpeg: (file) => convertHeicToJpeg(file),
    buildPreviewImage: (image) => buildPreviewImage(image),
    captureVideoFrame: (video) => captureVideoFrame(video),
    requestUpload,
    uploadToTarget,
    cancelUpload,
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => {
      URL.revokeObjectURL(url);
    },
  };
}

type Scoped = { contactId: string; attachment: Attachment };

/** The state belongs to one chat; another chat starts from idle. */
function scopedReducer(state: Scoped, action: { contactId: string; event: AttachmentEvent }) {
  const base = state.contactId === action.contactId ? state.attachment : IDLE;
  const next = attachmentReducer(base, action.event);
  return next === state.attachment && action.contactId === state.contactId
    ? state
    : { contactId: action.contactId, attachment: next };
}

/**
 * The attachment of the composer of one chat (ui-screens 7.6). Changing chat or unmounting acts
 * like cancel (abort, discard, revoke) and no state update happens afterwards.
 */
export function useAttachment(contactId: string) {
  const [state, dispatch] = useReducer(scopedReducer, { contactId, attachment: IDLE });
  const controller = useRef<AttachmentController | null>(null);

  useEffect(() => {
    const created = createAttachmentController(browserDeps(), (event) => {
      dispatch({ contactId, event });
    });
    controller.current = created;
    return () => {
      created.dispose();
      if (controller.current === created) controller.current = null;
    };
  }, [contactId]);

  const pick = useCallback((file: PickedFile) => {
    controller.current?.pick(file);
  }, []);
  const cancel = useCallback(() => {
    controller.current?.cancel();
  }, []);
  const handOff = useCallback(() => controller.current?.handOff() ?? null, []);

  return {
    attachment: state.contactId === contactId ? state.attachment : IDLE,
    pick,
    cancel,
    handOff,
  };
}

// ---------------------------------------------------------------------------
// Preview URLs of sent media (ui-screens 7.6 step 7)
// ---------------------------------------------------------------------------

/** Message id → local preview URL, until the server row has its own `media.previewUrl`. */
const sentPreviews = new Map<string, string>();

/** Keeps the preview URL of a sent media message alive until the server has a preview. */
export function rememberSentPreview(messageId: string, url: string): void {
  sentPreviews.set(messageId, url);
}

function threadItems(data: unknown): readonly ThreadMessage[] {
  if (typeof data !== 'object' || data === null || !('items' in data)) return [];
  const items = data.items; // ThreadState of qk.messages(id)
  return Array.isArray(items) ? (items as ThreadMessage[]) : []; // rows written by useThread and useSendMessage
}

function isThreadKey(queryKey: unknown): boolean {
  return Array.isArray(queryKey) && queryKey[0] === qkAll.messages[0];
}

/**
 * Revokes the object URL of a sent image or video once the message has `media.previewUrl`, by
 * watching every thread in the query cache (the message may belong to a chat no longer open).
 */
export function useReleaseSentPreviews(): void {
  const client = useQueryClient();
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || sentPreviews.size === 0) return;
        if (!isThreadKey(event.query.queryKey)) return;
        for (const id of previewsToRelease(sentPreviews, threadItems(event.query.state.data))) {
          const url = sentPreviews.get(id);
          sentPreviews.delete(id);
          if (url !== undefined) URL.revokeObjectURL(url);
        }
      }),
    [client],
  );
}

// ---------------------------------------------------------------------------
// Typing ping (ui-screens 5.8)
// ---------------------------------------------------------------------------

/**
 * `onChange` helper of the composer text box. A new chat starts a new throttle (`lastSentAt`
 * resets); nothing is sent while the composer is disabled.
 */
export function useTypingPing(contactId: string, enabled: boolean): (value: string) => void {
  const pinger = useRef<TypingPinger | null>(null);

  useEffect(() => {
    pinger.current = createTypingPinger({
      intervalMs: TYPING_PING_INTERVAL_MS,
      now: () => Date.now(),
      send: () => notifyTyping(contactId),
    });
    return () => {
      pinger.current = null;
    };
  }, [contactId]);

  return useCallback(
    (value: string) => {
      if (enabled) pinger.current?.onInput(value);
    },
    [enabled],
  );
}
