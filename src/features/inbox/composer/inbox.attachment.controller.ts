// Attachment of the composer (ui-screens 7.6), side effects: read, convert, preview, ticket, PUT
// and discard, with injected browser and API functions so the whole flow is tested without a
// browser. The states it dispatches are those of `attachmentReducer`.
import { errorCodeOf } from '@/common/common.api';
import type { IssueUploadBody, UploadTargetDto, UploadTicketDto } from '@/contracts';

import type { UploadOptions } from '../inbox.api';
import { validateAttachment, type AttachmentCheck } from '../inbox.logic';
import {
  conversionFor,
  type AttachmentError,
  type AttachmentEvent,
  type MainContentType,
  type Prepared,
} from './inbox.attachment.logic';

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
