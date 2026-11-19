// Attachment of the composer (ui-screens 7.6 and 5.10), pure part: the state machine the tray
// renders, the conversion plan of each accepted type, the tray view and the release rule of sent
// previews. The side effects are in `inbox.attachment.controller.ts`; the React wiring is in
// `inbox.composer.hooks.ts`.
import { errorMessage, type ErrorMessageCode } from '@/common/error-messages';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '@/contracts';

import { copy } from '../inbox.constants';
import type { AttachmentCheck, MediaKind, ThreadMessage } from '../inbox.logic';

// ---------------------------------------------------------------------------
// State machine
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
export type Prepared = { kind: AttachmentKind; contentType: MainContentType; previewUrl: string };

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
// Preview URLs of sent media (ui-screens 7.6 step 7)
// ---------------------------------------------------------------------------

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
