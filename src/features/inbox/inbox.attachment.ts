// Attachment flow of the composer (ui-screens 7.6 and 5.10), in three layers:
//  1. `attachmentReducer`: the pure state machine the tray renders.
//  2. `createAttachmentController`: the side effects (read, convert, preview, ticket, PUT, discard)
//     with injected browser and API functions, so the whole flow is tested without a browser.
//  3. `useAttachment`: wires one controller per chat to React and disposes it on chat change and
//     unmount.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { errorMessage, type ErrorMessageCode } from '@/common/error-messages';
import { qkAll } from '@/common/query-keys';
import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  type IssueUploadBody,
  type UploadTargetDto,
  type UploadTicketDto,
} from '@/contracts';

import { cancelUpload, requestUpload, uploadToTarget, type UploadOptions } from './inbox.api';
import { copy } from './inbox.constants';
import {
  validateAttachment,
  type AttachmentCheck,
  type MediaKind,
  type ThreadMessage,
} from './inbox.logic';
import {
  buildPreviewImage,
  captureVideoFrame,
  convertHeicToJpeg,
  convertToJpeg,
  readHeadBytes,
} from './inbox.media';

// ---------------------------------------------------------------------------
// 1. State machine
// ---------------------------------------------------------------------------

export type AttachmentKind = 'image' | 'video';
/** The only types the server accepts (line-messaging "สื่อขาออก"). */
export type MainContentType = 'image/jpeg' | 'image/png' | 'video/mp4';
export type CheckCode = Extract<AttachmentCheck, { ok: false }>['code'];

export type AttachmentError =
  /** The picked file, or the file after conversion, breaks a rule of `validateAttachment`. */
  | { kind: 'check'; code: CheckCode; sizeMb?: string }
  /** Reading, converting or making the preview failed. */
  | { kind: 'convert' }
  /** `POST /api/uploads` failed with this code. */
  | { kind: 'request'; code: ErrorMessageCode }
  /** A PUT of the preview or the file failed. */
  | { kind: 'upload' };

type Attempt = { attempt: number; fileName: string };
type Prepared = { kind: AttachmentKind; contentType: MainContentType; previewUrl: string };

export type Attachment =
  | { status: 'idle' }
  | (Attempt & { status: 'validating' })
  | (Attempt & { status: 'converting'; kind: AttachmentKind })
  | (Attempt & Prepared & { status: 'requesting' })
  | (Attempt & Prepared & { status: 'uploading'; uploadId: string; progress: number | null })
  | (Attempt & Prepared & { status: 'ready'; uploadId: string })
  | (Attempt & { status: 'rejected'; error: AttachmentError })
  | (Attempt & {
      status: 'failed';
      error: AttachmentError;
      kind: AttachmentKind | null;
      previewUrl: string | null;
    })
  | (Attempt & { status: 'cancelling' });

export type AttachmentStatus = Attachment['status'];

export const IDLE: Attachment = { status: 'idle' };

export type AttachmentEvent =
  | { type: 'picked'; attempt: number; fileName: string }
  | { type: 'validated'; attempt: number; kind: AttachmentKind }
  | { type: 'rejected'; attempt: number; error: AttachmentError }
  | { type: 'prepared'; attempt: number; contentType: MainContentType; previewUrl: string }
  | { type: 'issued'; attempt: number; uploadId: string }
  | { type: 'progress'; attempt: number; pct: number | null }
  | { type: 'uploaded'; attempt: number }
  | { type: 'failed'; attempt: number; error: AttachmentError }
  /** The X button: cancel before sending, or close a rejected or failed file. */
  | { type: 'cancel' }
  | { type: 'cancelled'; attempt: number }
  | { type: 'sent'; attempt: number };

const sameAttempt = (state: Attachment, attempt: number): boolean =>
  state.status !== 'idle' && state.attempt === attempt;

/**
 * The state machine of ui-screens 7.6. An event of an older attempt (a file already cancelled or
 * replaced) or one that does not apply to the current status returns `state` unchanged.
 */
export function attachmentReducer(state: Attachment, event: AttachmentEvent): Attachment {
  switch (event.type) {
    case 'picked':
      // A new file always starts over; the controller has already let go of the old one.
      return { status: 'validating', attempt: event.attempt, fileName: event.fileName };

    case 'validated':
      if (state.status !== 'validating' || !sameAttempt(state, event.attempt)) return state;
      return { ...state, status: 'converting', kind: event.kind };

    case 'rejected':
      if (state.status !== 'validating' || !sameAttempt(state, event.attempt)) return state;
      return {
        status: 'rejected',
        attempt: state.attempt,
        fileName: state.fileName,
        error: event.error,
      };

    case 'prepared':
      if (state.status !== 'converting' || !sameAttempt(state, event.attempt)) return state;
      return {
        status: 'requesting',
        attempt: state.attempt,
        fileName: state.fileName,
        kind: state.kind,
        contentType: event.contentType,
        previewUrl: event.previewUrl,
      };

    case 'issued':
      if (state.status !== 'requesting' || !sameAttempt(state, event.attempt)) return state;
      return { ...state, status: 'uploading', uploadId: event.uploadId, progress: 0 };

    case 'progress':
      if (state.status !== 'uploading' || !sameAttempt(state, event.attempt)) return state;
      return state.progress === event.pct ? state : { ...state, progress: event.pct };

    case 'uploaded': {
      if (state.status !== 'uploading' || !sameAttempt(state, event.attempt)) return state;
      return {
        status: 'ready',
        attempt: state.attempt,
        fileName: state.fileName,
        kind: state.kind,
        contentType: state.contentType,
        previewUrl: state.previewUrl,
        uploadId: state.uploadId,
      };
    }

    case 'failed':
      switch (state.status) {
        case 'validating':
        case 'converting':
        case 'requesting':
        case 'uploading':
          if (!sameAttempt(state, event.attempt)) return state;
          return {
            status: 'failed',
            attempt: state.attempt,
            fileName: state.fileName,
            error: event.error,
            kind: state.status === 'validating' ? null : state.kind,
            previewUrl:
              state.status === 'requesting' || state.status === 'uploading'
                ? state.previewUrl
                : null,
          };
        case 'idle':
        case 'ready':
        case 'rejected':
        case 'failed':
        case 'cancelling':
          return state;
      }
      return state;

    case 'cancel':
      switch (state.status) {
        case 'validating':
        case 'converting':
        case 'requesting':
        case 'uploading':
        case 'ready':
          return { status: 'cancelling', attempt: state.attempt, fileName: state.fileName };
        case 'rejected':
        case 'failed':
          return IDLE; // "close": nothing to cancel any more
        case 'idle':
        case 'cancelling':
          return state;
      }
      return state;

    case 'cancelled':
      return state.status === 'cancelling' && sameAttempt(state, event.attempt) ? IDLE : state;

    case 'sent':
      return state.status === 'ready' && sameAttempt(state, event.attempt) ? IDLE : state;
  }
}

/** Still being prepared or uploaded: the send button waits (`inbox.composer.waitUpload`). */
export function isAttachmentPending(state: Attachment): boolean {
  switch (state.status) {
    case 'validating':
    case 'converting':
    case 'requesting':
    case 'uploading':
    case 'cancelling':
      return true;
    case 'idle':
    case 'ready':
    case 'rejected':
    case 'failed':
      return false;
  }
}

/** What happens to a picked file of a type `validateAttachment` accepted. */
export function conversionFor(sourceType: MediaKind): {
  convert: 'none' | 'jpeg' | 'heic';
  contentType: MainContentType;
} {
  switch (sourceType) {
    case 'jpeg':
      return { convert: 'none', contentType: 'image/jpeg' };
    case 'png':
      return { convert: 'none', contentType: 'image/png' };
    case 'webp':
      return { convert: 'jpeg', contentType: 'image/jpeg' };
    case 'heic':
      return { convert: 'heic', contentType: 'image/jpeg' };
    case 'mp4':
      return { convert: 'none', contentType: 'video/mp4' };
    case 'mov':
    case 'unknown':
      // validateAttachment rejects these first; reaching here is a bug in the caller.
      throw new Error(`no conversion for ${sourceType}`);
  }
}

// ---------------------------------------------------------------------------
// Tray view (ui-screens 5.10)
// ---------------------------------------------------------------------------

const MB = 1024 * 1024;

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}

/** Thai text of an attachment error (ui-copy `inbox.attach.error.*` and the error catalog). */
export function attachmentErrorText(error: AttachmentError): string {
  switch (error.kind) {
    case 'check': {
      const maxBytes = error.code === 'video_too_large' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
      return fill(copy.attach.error[error.code], {
        maxMb: String(Math.round((maxBytes / MB) * 10) / 10),
        sizeMb: error.sizeMb ?? '',
      });
    }
    case 'convert':
      return copy.attach.error.convertFailed;
    case 'request':
      return errorMessage(error.code) ?? copy.attach.error.uploadFailed;
    case 'upload':
      return copy.attach.error.uploadFailed;
  }
}

/**
 * Code of an attachment error for `data-code` of `attachment-status` (ui-screens 11): the check
 * code or the server error code, and the copy key for the client-side failures.
 */
export function attachmentErrorCode(error: AttachmentError): string {
  switch (error.kind) {
    case 'check':
    case 'request':
      return error.code;
    case 'convert':
      return 'convertFailed';
    case 'upload':
      return 'uploadFailed';
  }
}

export type TrayView = {
  status: AttachmentStatus;
  fileName: string;
  kind: AttachmentKind | null;
  previewUrl: string | null;
  text: string;
  /** Text for screen readers: the same without the changing percentage. */
  announce: string;
  tone: 'muted' | 'danger';
  /** `data-code` of the status line; only for `rejected` and `failed`. */
  code: string | undefined;
  /** `undefined`: no bar; `null`: a bar without a known percentage. */
  progress: number | null | undefined;
  /** `aria-label` of the X button. */
  buttonLabel: string;
};

/** Everything `AttachmentTray` shows for a state, or `null` when there is no tray. */
export function trayView(state: Attachment): TrayView | null {
  switch (state.status) {
    case 'idle':
    case 'cancelling':
      return null;
    case 'validating':
    case 'converting':
      return {
        status: state.status,
        fileName: state.fileName,
        kind: state.status === 'converting' ? state.kind : null,
        previewUrl: null,
        text: copy.attach.preparing,
        announce: copy.attach.preparing,
        tone: 'muted',
        code: undefined,
        progress: undefined,
        buttonLabel: copy.attach.cancel,
      };
    case 'requesting':
    case 'uploading': {
      const pct = state.status === 'requesting' ? 0 : state.progress;
      return {
        status: state.status,
        fileName: state.fileName,
        kind: state.kind,
        previewUrl: state.previewUrl,
        text:
          pct === null
            ? copy.attach.uploadingNoPercent
            : fill(copy.attach.uploading, { percent: String(pct) }),
        announce: copy.attach.uploadingNoPercent,
        tone: 'muted',
        code: undefined,
        progress: pct,
        buttonLabel: copy.attach.cancel,
      };
    }
    case 'ready':
      return {
        status: state.status,
        fileName: state.fileName,
        kind: state.kind,
        previewUrl: state.previewUrl,
        text: copy.attach.ready,
        announce: copy.attach.ready,
        tone: 'muted',
        code: undefined,
        progress: undefined,
        buttonLabel: copy.attach.cancel,
      };
    case 'rejected':
    case 'failed': {
      const text = attachmentErrorText(state.error);
      return {
        status: state.status,
        fileName: state.fileName,
        kind: state.status === 'failed' ? state.kind : null,
        previewUrl: state.status === 'failed' ? state.previewUrl : null,
        text,
        announce: text,
        tone: 'danger',
        code: attachmentErrorCode(state.error),
        progress: undefined,
        buttonLabel: copy.attach.remove,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Side effects
// ---------------------------------------------------------------------------

export type AttachmentDeps = {
  readHead: (file: Blob, n: number) => Promise<Uint8Array>;
  convertToJpeg: (file: Blob) => Promise<Blob>;
  convertHeicToJpeg: (file: Blob) => Promise<Blob>;
  buildPreviewImage: (image: Blob) => Promise<Blob>;
  captureVideoFrame: (video: Blob) => Promise<Blob>;
  requestUpload: (body: IssueUploadBody) => Promise<UploadTicketDto>;
  uploadToTarget: (target: UploadTargetDto, blob: Blob, opts: UploadOptions) => Promise<void>;
  cancelUpload: (uploadId: string) => Promise<void>;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
};

/** A picked file: a `File`, or any blob with a name in tests. */
export type PickedFile = Blob & { name: string };

/** What the composer sends once the file is ready (ui-screens 5.7 step 2, 7.5). */
export type HandOff =
  | {
      kind: 'image';
      uploadId: string;
      contentType: 'image/jpeg' | 'image/png';
      localPreviewUrl: string;
    }
  | { kind: 'video'; uploadId: string; contentType: 'video/mp4'; localPreviewUrl: string };

export type AttachmentController = {
  /** Starts a new file; a file already in the tray is cancelled first (ui-screens 5.10). */
  pick(file: PickedFile): void;
  /** The X button: abort, discard the upload if there is one, revoke previews. */
  cancel(): void;
  /** When ready: the send input; the preview URL now belongs to the sent message. */
  handOff(): HandOff | null;
  /** Chat change or unmount: like cancel, and no event is dispatched any more. */
  dispose(): void;
};

type Job = {
  attempt: number;
  abort: AbortController;
  uploadId: string | null;
  discarded: boolean;
  urls: string[];
  ready: HandOff | null;
};

/** Bytes `sniffMediaType` needs. */
const HEAD_BYTES = 64;

function toHandOff(prepared: Prepared, uploadId: string): HandOff {
  return prepared.kind === 'video'
    ? { kind: 'video', uploadId, contentType: 'video/mp4', localPreviewUrl: prepared.previewUrl }
    : {
        kind: 'image',
        uploadId,
        // An image is JPEG or PNG after `conversionFor`.
        contentType: prepared.contentType === 'image/png' ? 'image/png' : 'image/jpeg',
        localPreviewUrl: prepared.previewUrl,
      };
}

/**
 * Runs the steps of ui-screens 7.6 for one file at a time. Every upload that got a ticket and is
 * not handed off is discarded with `cancelUpload` exactly once, whether it was cancelled, failed,
 * replaced or the chat closed, even when the ticket arrives after the cancel.
 */
export function createAttachmentController(
  deps: AttachmentDeps,
  dispatch: (event: AttachmentEvent) => void,
): AttachmentController {
  let attempts = 0;
  let current: Job | null = null;
  let disposed = false;

  const live = (job: Job): boolean => !disposed && current === job && !job.abort.signal.aborted;
  const emit = (job: Job, event: AttachmentEvent): void => {
    if (live(job)) dispatch(event);
  };

  function discard(job: Job): void {
    if (job.uploadId === null || job.discarded) return;
    job.discarded = true;
    try {
      // Not awaited; a failure shows nothing (ui-screens 7.6 "ยกเลิก").
      deps.cancelUpload(job.uploadId).catch(() => undefined);
    } catch {
      // Same for a synchronous throw.
    }
  }

  function release(job: Job): void {
    job.abort.abort();
    discard(job);
    for (const url of job.urls.splice(0)) deps.revokeObjectUrl(url);
  }

  async function prepare(
    job: Job,
    file: PickedFile,
    check: Extract<AttachmentCheck, { ok: true }>,
  ): Promise<{ main: Blob; preview: Blob; contentType: MainContentType } | AttachmentError | null> {
    const plan = conversionFor(check.sourceType);
    let main: Blob = file;
    if (plan.convert === 'jpeg') main = await deps.convertToJpeg(file);
    if (plan.convert === 'heic') main = await deps.convertHeicToJpeg(file);
    if (!live(job)) return null;
    if (main !== file) {
      // The converted file must still be within the limits (ui-screens 7.6 step 3).
      const again = validateAttachment(
        { name: file.name, type: plan.contentType, size: main.size },
        await deps.readHead(main, HEAD_BYTES),
      );
      if (!again.ok) return { kind: 'check', code: again.code, sizeMb: again.sizeMb };
    }
    const preview =
      check.kind === 'image'
        ? await deps.buildPreviewImage(main)
        : await deps.captureVideoFrame(file);
    return { main, preview, contentType: plan.contentType };
  }

  async function run(job: Job, file: PickedFile): Promise<void> {
    const { attempt } = job;
    const fail = (error: AttachmentError): void => {
      emit(job, { type: 'failed', attempt, error });
    };

    // validating
    let head: Uint8Array;
    try {
      head = await deps.readHead(file, HEAD_BYTES);
    } catch {
      fail({ kind: 'convert' });
      return;
    }
    if (!live(job)) return;
    const check = validateAttachment({ name: file.name, type: file.type, size: file.size }, head);
    if (!check.ok) {
      emit(job, {
        type: 'rejected',
        attempt,
        error: { kind: 'check', code: check.code, sizeMb: check.sizeMb },
      });
      return;
    }
    emit(job, { type: 'validated', attempt, kind: check.kind });

    // converting
    let prepared: Awaited<ReturnType<typeof prepare>>;
    try {
      prepared = await prepare(job, file, check);
    } catch {
      fail({ kind: 'convert' });
      return;
    }
    if (prepared === null || !live(job)) return;
    if (!('main' in prepared)) {
      fail(prepared);
      return;
    }
    const { main, preview, contentType } = prepared;
    const previewUrl = deps.createObjectUrl(preview);
    job.urls.push(previewUrl);
    emit(job, { type: 'prepared', attempt, contentType, previewUrl });

    // requesting
    let ticket: UploadTicketDto;
    try {
      ticket = await deps.requestUpload({
        kind: check.kind,
        contentType,
        sizeBytes: main.size,
        preview: { contentType: 'image/jpeg', sizeBytes: preview.size },
      });
    } catch (error) {
      fail({ kind: 'request', code: errorCodeOf(error) });
      return;
    }
    job.uploadId = ticket.uploadId;
    if (!live(job)) {
      discard(job); // cancelled while the ticket was on its way
      return;
    }
    emit(job, { type: 'issued', attempt, uploadId: ticket.uploadId });

    // uploading: the preview first, then the file; progress is the file's (ui-screens 7.6 step 5)
    const signal = job.abort.signal;
    try {
      await deps.uploadToTarget(ticket.preview, preview, { onProgress: () => undefined, signal });
      await deps.uploadToTarget(ticket.original, main, {
        signal,
        onProgress: (pct) => {
          emit(job, { type: 'progress', attempt, pct });
        },
      });
    } catch {
      if (!live(job)) return; // aborted: `release` already discarded it
      discard(job);
      fail({ kind: 'upload' });
      return;
    }
    if (!live(job)) return;
    job.ready = toHandOff({ kind: check.kind, contentType, previewUrl }, ticket.uploadId);
    emit(job, { type: 'uploaded', attempt });
  }

  return {
    pick(file) {
      if (disposed) return;
      if (current !== null) release(current);
      attempts += 1;
      const job: Job = {
        attempt: attempts,
        abort: new AbortController(),
        uploadId: null,
        discarded: false,
        urls: [],
        ready: null,
      };
      current = job;
      dispatch({ type: 'picked', attempt: job.attempt, fileName: file.name });
      void run(job, file);
    },

    cancel() {
      if (disposed) return;
      const job = current;
      dispatch({ type: 'cancel' });
      if (job === null) return;
      current = null;
      release(job);
      dispatch({ type: 'cancelled', attempt: job.attempt });
    },

    handOff() {
      const job = current;
      if (disposed || job === null || job.ready === null) return null;
      current = null; // the preview URL and the upload now belong to the message
      dispatch({ type: 'sent', attempt: job.attempt });
      return job.ready;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (current !== null) release(current);
      current = null;
    },
  };
}

// ---------------------------------------------------------------------------
// 3. React
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

/** Ids of remembered previews whose message now has a preview from the server. */
export function previewsToRelease(
  pending: ReadonlyMap<string, string>,
  rows: readonly ThreadMessage[],
): string[] {
  if (pending.size === 0) return [];
  return rows
    .filter((row) => pending.has(row.id) && (row.media?.previewUrl ?? null) !== null)
    .map((row) => row.id);
}

function threadItems(data: unknown): readonly ThreadMessage[] {
  if (typeof data !== 'object' || data === null || !('items' in data)) return [];
  const items = data.items; // ThreadState of qk.messages(id)
  return Array.isArray(items) ? (items as ThreadMessage[]) : []; // rows written by inbox.hooks
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
