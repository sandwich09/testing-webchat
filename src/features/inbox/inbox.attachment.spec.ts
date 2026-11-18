import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/common/common.api';
import { errorMessage } from '@/common/error-messages';
import { IMAGE_MAX_BYTES, type UploadTargetDto, type UploadTicketDto } from '@/contracts';

import type { UploadOptions } from './inbox.api';
import {
  attachmentErrorCode,
  attachmentErrorText,
  attachmentReducer,
  conversionFor,
  createAttachmentController,
  IDLE,
  isAttachmentPending,
  previewsToRelease,
  trayView,
  type Attachment,
  type AttachmentDeps,
  type AttachmentEvent,
  type PickedFile,
} from './inbox.attachment';
import { copy } from './inbox.constants';
import type { ThreadMessage } from './inbox.logic';
import { readHeadBytes } from './inbox.media';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ascii = (text: string): number[] => Array.from(new TextEncoder().encode(text));
const HEADS = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii('JFIF')],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')],
  heic: [0, 0, 0, 0x18, ...ascii('ftypheic')],
  mp4: [0, 0, 0, 0x18, ...ascii('ftypisom')],
  mov: [0, 0, 0, 0x14, ...ascii('ftypqt  ')],
  unknown: ascii('%PDF-1.7'),
} as const;

function file(kind: keyof typeof HEADS, name = `f.${kind}`, size = 2048): PickedFile {
  const bytes = new Uint8Array(size);
  bytes.set(HEADS[kind]);
  return new File([bytes], name);
}

const jpegBlob = (size = 1500): Blob => {
  const bytes = new Uint8Array(size);
  bytes.set(HEADS.jpeg);
  return new Blob([bytes], { type: 'image/jpeg' });
};

const target = (name: string): UploadTargetDto => ({
  strategy: 'http_put',
  url: `/api/local-storage/${name}`,
  headers: {},
  contentType: 'image/jpeg',
  maxSizeBytes: IMAGE_MAX_BYTES,
});

let ticketCount = 0;
function ticket(): UploadTicketDto {
  ticketCount += 1;
  return {
    uploadId: `upload_${String(ticketCount).padStart(15, '0')}`,
    expiresAt: '2026-11-18T03:15:00.000Z',
    original: target('original'),
    preview: target('preview'),
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** A controller with fake browser and API parts; `state` follows the reducer. */
function setup(overrides: Partial<AttachmentDeps> = {}) {
  let urls = 0;
  const revoked: string[] = [];
  const uploads: { target: UploadTargetDto; blob: Blob; opts: UploadOptions }[] = [];
  const deps: AttachmentDeps = {
    readHead: vi.fn(readHeadBytes),
    convertToJpeg: vi.fn(() => Promise.resolve(jpegBlob(3000))),
    convertHeicToJpeg: vi.fn(() => Promise.resolve(jpegBlob(4000))),
    buildPreviewImage: vi.fn(() => Promise.resolve(jpegBlob(500))),
    captureVideoFrame: vi.fn(() => Promise.resolve(jpegBlob(600))),
    requestUpload: vi.fn(() => Promise.resolve(ticket())),
    uploadToTarget: vi.fn((t: UploadTargetDto, blob: Blob, opts: UploadOptions) => {
      uploads.push({ target: t, blob, opts });
      opts.onProgress(50);
      opts.onProgress(100);
      return Promise.resolve();
    }),
    cancelUpload: vi.fn(() => Promise.resolve()),
    createObjectUrl: vi.fn(() => {
      urls += 1;
      return `blob:preview-${String(urls)}`;
    }),
    revokeObjectUrl: vi.fn((url: string) => {
      revoked.push(url);
    }),
    ...overrides,
  };
  const events: AttachmentEvent[] = [];
  const statuses: string[] = [];
  let state: Attachment = IDLE;
  const controller = createAttachmentController(deps, (event) => {
    events.push(event);
    state = attachmentReducer(state, event);
    if (statuses[statuses.length - 1] !== state.status) statuses.push(state.status);
  });
  return {
    deps,
    controller,
    events,
    statuses,
    revoked,
    uploads,
    get state() {
      return state;
    },
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const A = { attempt: 1, fileName: 'a.jpg' };
const prepared = {
  ...A,
  kind: 'image' as const,
  contentType: 'image/jpeg' as const,
  previewUrl: 'blob:p',
};
const STATES: Record<Attachment['status'], Attachment> = {
  idle: IDLE,
  validating: { status: 'validating', ...A },
  converting: { status: 'converting', ...A, kind: 'image' },
  requesting: { status: 'requesting', ...prepared },
  uploading: { status: 'uploading', ...prepared, uploadId: 'u1', progress: 0 },
  ready: { status: 'ready', ...prepared, uploadId: 'u1' },
  rejected: { status: 'rejected', ...A, error: { kind: 'check', code: 'mov_not_supported' } },
  failed: { status: 'failed', ...A, error: { kind: 'convert' }, kind: 'image', previewUrl: null },
  cancelling: { status: 'cancelling', ...A },
};

describe('attachmentReducer', () => {
  it('walks the happy path idle → validating → converting → requesting → uploading → ready → idle', () => {
    const steps: AttachmentEvent[] = [
      { type: 'picked', attempt: 1, fileName: 'a.jpg' },
      { type: 'validated', attempt: 1, kind: 'image' },
      { type: 'prepared', attempt: 1, contentType: 'image/jpeg', previewUrl: 'blob:p' },
      { type: 'issued', attempt: 1, uploadId: 'u1' },
      { type: 'progress', attempt: 1, pct: 40 },
      { type: 'uploaded', attempt: 1 },
      { type: 'sent', attempt: 1 },
    ];
    const seen: Attachment[] = [];
    steps.reduce<Attachment>((state, event) => {
      const next = attachmentReducer(state, event);
      seen.push(next);
      return next;
    }, IDLE);
    expect(seen.map((s) => s.status)).toEqual([
      'validating',
      'converting',
      'requesting',
      'uploading',
      'uploading',
      'ready',
      'idle',
    ]);
    expect(seen[4]).toMatchObject({ progress: 40, uploadId: 'u1', previewUrl: 'blob:p' });
    expect(seen[5]).toEqual({ status: 'ready', ...prepared, uploadId: 'u1' });
  });

  it('starts over on a new pick from any state', () => {
    for (const state of Object.values(STATES)) {
      expect(attachmentReducer(state, { type: 'picked', attempt: 7, fileName: 'b.png' })).toEqual({
        status: 'validating',
        attempt: 7,
        fileName: 'b.png',
      });
    }
  });

  it('rejects only while validating', () => {
    const error = { kind: 'check', code: 'empty_file' } as const;
    expect(attachmentReducer(STATES.validating, { type: 'rejected', attempt: 1, error })).toEqual({
      status: 'rejected',
      ...A,
      error,
    });
    for (const status of ['converting', 'requesting', 'uploading', 'ready', 'idle'] as const) {
      expect(attachmentReducer(STATES[status], { type: 'rejected', attempt: 1, error })).toBe(
        STATES[status],
      );
    }
  });

  it('fails from every working step, keeping the preview once there is one', () => {
    const error = { kind: 'upload' } as const;
    const fail = (s: Attachment) => attachmentReducer(s, { type: 'failed', attempt: 1, error });
    expect(fail(STATES.validating)).toEqual({
      status: 'failed',
      ...A,
      error,
      kind: null,
      previewUrl: null,
    });
    expect(fail(STATES.converting)).toMatchObject({
      status: 'failed',
      kind: 'image',
      previewUrl: null,
    });
    expect(fail(STATES.requesting)).toMatchObject({ status: 'failed', previewUrl: 'blob:p' });
    expect(fail(STATES.uploading)).toMatchObject({ status: 'failed', previewUrl: 'blob:p' });
    for (const status of ['idle', 'ready', 'rejected', 'failed', 'cancelling'] as const) {
      expect(fail(STATES[status])).toBe(STATES[status]);
    }
  });

  it('cancels every state before sending, and closes a rejected or failed file', () => {
    for (const status of [
      'validating',
      'converting',
      'requesting',
      'uploading',
      'ready',
    ] as const) {
      const cancelling = attachmentReducer(STATES[status], { type: 'cancel' });
      expect(cancelling).toEqual({ status: 'cancelling', ...A });
      expect(attachmentReducer(cancelling, { type: 'cancelled', attempt: 1 })).toBe(IDLE);
    }
    expect(attachmentReducer(STATES.rejected, { type: 'cancel' })).toBe(IDLE);
    expect(attachmentReducer(STATES.failed, { type: 'cancel' })).toBe(IDLE);
    expect(attachmentReducer(IDLE, { type: 'cancel' })).toBe(IDLE);
    expect(attachmentReducer(STATES.cancelling, { type: 'cancel' })).toBe(STATES.cancelling);
  });

  it('ignores events of an older attempt', () => {
    const old = 0;
    const cases: [Attachment, AttachmentEvent][] = [
      [STATES.validating, { type: 'validated', attempt: old, kind: 'image' }],
      [STATES.validating, { type: 'rejected', attempt: old, error: { kind: 'convert' } }],
      [
        STATES.converting,
        { type: 'prepared', attempt: old, contentType: 'image/png', previewUrl: 'x' },
      ],
      [STATES.requesting, { type: 'issued', attempt: old, uploadId: 'u0' }],
      [STATES.uploading, { type: 'progress', attempt: old, pct: 99 }],
      [STATES.uploading, { type: 'uploaded', attempt: old }],
      [STATES.uploading, { type: 'failed', attempt: old, error: { kind: 'upload' } }],
      [STATES.cancelling, { type: 'cancelled', attempt: old }],
      [STATES.ready, { type: 'sent', attempt: old }],
    ];
    for (const [state, event] of cases) expect(attachmentReducer(state, event)).toBe(state);
  });

  it('ignores events that do not apply to the current status', () => {
    const cases: [Attachment, AttachmentEvent][] = [
      [IDLE, { type: 'validated', attempt: 1, kind: 'image' }],
      [STATES.ready, { type: 'prepared', attempt: 1, contentType: 'image/png', previewUrl: 'x' }],
      [STATES.converting, { type: 'issued', attempt: 1, uploadId: 'u1' }],
      [STATES.requesting, { type: 'progress', attempt: 1, pct: 3 }],
      [STATES.requesting, { type: 'uploaded', attempt: 1 }],
      [STATES.uploading, { type: 'sent', attempt: 1 }],
      [STATES.ready, { type: 'cancelled', attempt: 1 }],
      [STATES.cancelling, { type: 'uploaded', attempt: 1 }],
    ];
    for (const [state, event] of cases) expect(attachmentReducer(state, event)).toBe(state);
  });

  it('keeps the same object when progress does not change, and allows an unknown percentage', () => {
    const same = attachmentReducer(STATES.uploading, { type: 'progress', attempt: 1, pct: 0 });
    expect(same).toBe(STATES.uploading);
    expect(
      attachmentReducer(STATES.uploading, { type: 'progress', attempt: 1, pct: null }),
    ).toMatchObject({ progress: null });
  });

  it('tells which states block the send button', () => {
    const pending = Object.values(STATES)
      .filter(isAttachmentPending)
      .map((s) => s.status);
    expect(pending).toEqual(['validating', 'converting', 'requesting', 'uploading', 'cancelling']);
  });
});

describe('conversionFor', () => {
  it('maps every accepted source type to what the server accepts', () => {
    expect(conversionFor('jpeg')).toEqual({ convert: 'none', contentType: 'image/jpeg' });
    expect(conversionFor('png')).toEqual({ convert: 'none', contentType: 'image/png' });
    expect(conversionFor('webp')).toEqual({ convert: 'jpeg', contentType: 'image/jpeg' });
    expect(conversionFor('heic')).toEqual({ convert: 'heic', contentType: 'image/jpeg' });
    expect(conversionFor('mp4')).toEqual({ convert: 'none', contentType: 'video/mp4' });
    expect(() => conversionFor('mov')).toThrow();
    expect(() => conversionFor('unknown')).toThrow();
  });
});

describe('tray view and error text', () => {
  it('shows the status line of each state (ui-screens 5.10)', () => {
    expect(trayView(IDLE)).toBeNull();
    expect(trayView(STATES.cancelling)).toBeNull();
    expect(trayView(STATES.validating)).toMatchObject({
      text: copy.attach.preparing,
      progress: undefined,
      buttonLabel: copy.attach.cancel,
    });
    expect(trayView(STATES.converting)?.text).toBe(copy.attach.preparing);
    expect(trayView(STATES.requesting)).toMatchObject({
      text: 'กำลังอัปโหลด 0%',
      progress: 0,
      previewUrl: 'blob:p',
    });
    expect(trayView({ ...STATES.uploading, progress: 42 } as Attachment)).toMatchObject({
      text: 'กำลังอัปโหลด 42%',
      announce: copy.attach.uploadingNoPercent,
      progress: 42,
    });
    expect(trayView({ ...STATES.uploading, progress: null } as Attachment)).toMatchObject({
      text: copy.attach.uploadingNoPercent,
      progress: null,
    });
    expect(trayView(STATES.ready)).toMatchObject({ text: copy.attach.ready, tone: 'muted' });
    expect(trayView(STATES.ready)?.code).toBeUndefined();
    expect(trayView(STATES.rejected)).toMatchObject({
      text: copy.attach.error.mov_not_supported,
      code: 'mov_not_supported',
      tone: 'danger',
      buttonLabel: copy.attach.remove,
    });
    expect(trayView(STATES.failed)).toMatchObject({
      text: copy.attach.error.convertFailed,
      code: 'convertFailed',
      tone: 'danger',
      kind: 'image',
    });
  });

  it('gives each error a code for data-code (ui-screens 11)', () => {
    expect(attachmentErrorCode({ kind: 'check', code: 'image_too_large', sizeMb: '12.3' })).toBe(
      'image_too_large',
    );
    expect(attachmentErrorCode({ kind: 'request', code: 'upload.rate_limited' })).toBe(
      'upload.rate_limited',
    );
    expect(attachmentErrorCode({ kind: 'convert' })).toBe('convertFailed');
    expect(attachmentErrorCode({ kind: 'upload' })).toBe('uploadFailed');
  });

  it('fills the size limits into the error text', () => {
    expect(attachmentErrorText({ kind: 'check', code: 'image_too_large', sizeMb: '12.3' })).toBe(
      'รูปต้องไม่เกิน 10 MB ไฟล์นี้ 12.3 MB',
    );
    expect(attachmentErrorText({ kind: 'check', code: 'video_too_large', sizeMb: '51.0' })).toBe(
      'วิดีโอต้องไม่เกิน 50 MB ไฟล์นี้ 51.0 MB',
    );
    expect(attachmentErrorText({ kind: 'check', code: 'unsupported_type' })).toBe(
      copy.attach.error.unsupported_type,
    );
    expect(attachmentErrorText({ kind: 'upload' })).toBe(copy.attach.error.uploadFailed);
  });

  it('uses the error catalog for a failed ticket, and the upload text when it has none', () => {
    expect(attachmentErrorText({ kind: 'request', code: 'upload.rate_limited' })).toBe(
      errorMessage('upload.rate_limited'),
    );
    expect(attachmentErrorText({ kind: 'request', code: 'client.network' })).toBe(
      errorMessage('client.network'),
    );
    expect(attachmentErrorText({ kind: 'request', code: 'db.unavailable' })).toBe(
      copy.attach.error.uploadFailed,
    );
  });
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

describe('createAttachmentController: success', () => {
  it('uploads a JPEG as is: ticket, preview PUT, file PUT with progress, then ready', async () => {
    const t = setup();
    const picked = file('jpeg', 'cake.jpg');
    t.controller.pick(picked);
    expect(t.state).toMatchObject({ status: 'validating', fileName: 'cake.jpg' });
    await flush();

    expect(t.statuses).toEqual(['validating', 'converting', 'requesting', 'uploading', 'ready']);
    expect(t.deps.convertToJpeg).not.toHaveBeenCalled();
    expect(t.deps.convertHeicToJpeg).not.toHaveBeenCalled();
    expect(t.deps.buildPreviewImage).toHaveBeenCalledWith(picked);
    expect(t.deps.requestUpload).toHaveBeenCalledWith({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: picked.size,
      preview: { contentType: 'image/jpeg', sizeBytes: 500 },
    });
    expect(t.uploads.map((u) => (u.target.strategy === 'http_put' ? u.target.url : ''))).toEqual([
      '/api/local-storage/preview',
      '/api/local-storage/original',
    ]);
    expect(t.uploads[1]?.blob).toBe(picked);
    expect(t.uploads[0]?.opts.signal).toBe(t.uploads[1]?.opts.signal); // one AbortController
    // Progress comes from the file, not the preview.
    const progress = t.events.flatMap((e) => (e.type === 'progress' ? [e.pct] : []));
    expect(progress).toEqual([50, 100]);
    expect(t.state).toMatchObject({ status: 'ready', contentType: 'image/jpeg' });
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
  });

  it('hands off the ready file once and keeps its preview URL alive for the message', async () => {
    const t = setup();
    t.controller.pick(file('png'));
    await flush();
    const ready = t.state;
    const handOff = t.controller.handOff();
    expect(handOff).toEqual({
      kind: 'image',
      uploadId: ready.status === 'ready' ? ready.uploadId : '',
      contentType: 'image/png',
      localPreviewUrl: 'blob:preview-1',
    });
    expect(t.state).toBe(IDLE);
    expect(t.controller.handOff()).toBeNull();
    t.controller.cancel();
    t.controller.dispose();
    expect(t.revoked).toEqual([]);
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
  });

  it('converts WebP with the canvas and HEIC with convertHeicToJpeg, sending JPEG', async () => {
    const webp = setup();
    webp.controller.pick(file('webp'));
    await flush();
    expect(webp.deps.convertToJpeg).toHaveBeenCalledTimes(1);
    expect(webp.deps.convertHeicToJpeg).not.toHaveBeenCalled();
    expect(webp.deps.requestUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg', sizeBytes: 3000 }),
    );
    expect(webp.uploads[1]?.blob.size).toBe(3000);

    const heic = setup();
    heic.controller.pick(file('heic', 'IMG_0001.HEIC'));
    await flush();
    expect(heic.deps.convertHeicToJpeg).toHaveBeenCalledTimes(1);
    expect(heic.deps.convertToJpeg).not.toHaveBeenCalled();
    expect(heic.deps.requestUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'image', contentType: 'image/jpeg', sizeBytes: 4000 }),
    );
    expect(heic.state.status).toBe('ready');
  });

  it('takes the first video frame as the preview of an MP4', async () => {
    const t = setup();
    const video = file('mp4', 'clip.mp4');
    t.controller.pick(video);
    await flush();
    expect(t.deps.captureVideoFrame).toHaveBeenCalledWith(video);
    expect(t.deps.buildPreviewImage).not.toHaveBeenCalled();
    expect(t.deps.requestUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video', contentType: 'video/mp4' }),
    );
    expect(t.controller.handOff()).toMatchObject({ kind: 'video', contentType: 'video/mp4' });
  });
});

describe('createAttachmentController: rejected and failed', () => {
  it.each([
    ['mov', 'mov_not_supported'],
    ['unknown', 'unsupported_type'],
  ] as const)('rejects %s by its content', async (kind, code) => {
    const t = setup();
    t.controller.pick(file(kind, 'looks-like.jpg'));
    await flush();
    expect(t.state).toMatchObject({ status: 'rejected', error: { kind: 'check', code } });
    expect(t.deps.requestUpload).not.toHaveBeenCalled();
    expect(t.deps.createObjectUrl).not.toHaveBeenCalled();
  });

  it('rejects an empty file and one over the size limit', async () => {
    const empty = setup();
    empty.controller.pick(new File([], 'empty.jpg'));
    await flush();
    expect(empty.state).toMatchObject({ status: 'rejected', error: { code: 'empty_file' } });

    const big = setup();
    big.controller.pick(file('jpeg', 'big.jpg', IMAGE_MAX_BYTES + 1));
    await flush();
    expect(big.state).toMatchObject({
      status: 'rejected',
      error: { kind: 'check', code: 'image_too_large', sizeMb: '10.0' },
    });
  });

  it('fails with convertFailed when a conversion throws (heic-to included)', async () => {
    const t = setup({ convertHeicToJpeg: () => Promise.reject(new Error('heic-to failed')) });
    t.controller.pick(file('heic'));
    await flush();
    expect(t.state).toMatchObject({ status: 'failed', error: { kind: 'convert' } });
    expect(trayView(t.state)?.text).toBe(copy.attach.error.convertFailed);
    expect(t.deps.requestUpload).not.toHaveBeenCalled();
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
  });

  it('fails when reading the file or making the preview throws', async () => {
    const read = setup({ readHead: () => Promise.reject(new Error('gone')) });
    read.controller.pick(file('jpeg'));
    await flush();
    expect(read.state).toMatchObject({ status: 'failed', error: { kind: 'convert' } });

    const preview = setup({ captureVideoFrame: () => Promise.reject(new Error('timeout')) });
    preview.controller.pick(file('mp4'));
    await flush();
    expect(preview.state).toMatchObject({ status: 'failed', error: { kind: 'convert' } });
    expect(preview.deps.createObjectUrl).not.toHaveBeenCalled();
  });

  it('checks the size again after conversion', async () => {
    const t = setup({ convertToJpeg: () => Promise.resolve(jpegBlob(IMAGE_MAX_BYTES + 1)) });
    t.controller.pick(file('webp'));
    await flush();
    expect(t.state).toMatchObject({
      status: 'failed',
      error: { kind: 'check', code: 'image_too_large' },
    });
    expect(t.deps.requestUpload).not.toHaveBeenCalled();
  });

  it('fails with the catalog text when the ticket is refused, without a discard', async () => {
    const t = setup({
      requestUpload: () => Promise.reject(new ApiError('upload.rate_limited', 429)),
    });
    t.controller.pick(file('jpeg'));
    await flush();
    expect(t.state).toMatchObject({
      status: 'failed',
      error: { kind: 'request', code: 'upload.rate_limited' },
      previewUrl: 'blob:preview-1',
    });
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
    expect(t.revoked).toEqual([]);
    t.controller.cancel(); // the X button closes it
    expect(t.state).toBe(IDLE);
    expect(t.revoked).toEqual(['blob:preview-1']);
  });

  it.each(['preview', 'original'])(
    'discards the upload exactly once when the %s PUT fails',
    async (failing) => {
      const t = setup({
        uploadToTarget: (target: UploadTargetDto) =>
          target.strategy === 'http_put' && target.url.endsWith(failing)
            ? Promise.reject(new ApiError('client.network', 0))
            : Promise.resolve(),
      });
      t.controller.pick(file('jpeg'));
      await flush();
      expect(t.state).toMatchObject({ status: 'failed', error: { kind: 'upload' } });
      expect(trayView(t.state)?.text).toBe(copy.attach.error.uploadFailed);
      expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
      t.controller.cancel();
      t.controller.dispose();
      expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    },
  );

  it('starts again cleanly when another file is picked after a failure', async () => {
    let calls = 0;
    const t = setup({
      requestUpload: () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new ApiError('storage.unavailable', 503))
          : Promise.resolve(ticket());
      },
    });
    t.controller.pick(file('jpeg'));
    await flush();
    expect(t.state.status).toBe('failed');
    t.controller.pick(file('jpeg', 'again.jpg'));
    expect(t.revoked).toEqual(['blob:preview-1']);
    await flush();
    expect(t.state).toMatchObject({ status: 'ready', fileName: 'again.jpg', attempt: 2 });
  });

  it('swallows a failed discard', async () => {
    const t = setup({ cancelUpload: () => Promise.reject(new Error('503')) });
    t.controller.pick(file('jpeg'));
    await flush();
    expect(() => {
      t.controller.cancel();
    }).not.toThrow();
    await flush();
    expect(t.state).toBe(IDLE);
  });
});

describe('createAttachmentController: cancel', () => {
  it('cancels while validating: later results are ignored', async () => {
    const head = deferred<Uint8Array>();
    const t = setup({ readHead: () => head.promise });
    t.controller.pick(file('jpeg'));
    t.controller.cancel();
    expect(t.statuses).toEqual(['validating', 'cancelling', 'idle']);
    head.resolve(new Uint8Array(HEADS.jpeg));
    await flush();
    expect(t.state).toBe(IDLE);
    expect(t.deps.buildPreviewImage).not.toHaveBeenCalled();
    expect(t.deps.requestUpload).not.toHaveBeenCalled();
  });

  it('cancels while converting: no preview URL is made and nothing is uploaded', async () => {
    const converted = deferred<Blob>();
    const t = setup({ convertHeicToJpeg: () => converted.promise });
    t.controller.pick(file('heic'));
    await flush();
    expect(t.state.status).toBe('converting');
    t.controller.cancel();
    converted.resolve(jpegBlob());
    await flush();
    expect(t.state).toBe(IDLE);
    expect(t.deps.createObjectUrl).not.toHaveBeenCalled();
    expect(t.deps.requestUpload).not.toHaveBeenCalled();
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
  });

  it('cancels while requesting: the ticket that arrives later is discarded once', async () => {
    const issued = deferred<UploadTicketDto>();
    const t = setup({ requestUpload: () => issued.promise });
    t.controller.pick(file('jpeg'));
    await flush();
    expect(t.state.status).toBe('requesting');
    t.controller.cancel();
    expect(t.state).toBe(IDLE);
    expect(t.revoked).toEqual(['blob:preview-1']);
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();

    const late = ticket();
    issued.resolve(late);
    await flush();
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    expect(t.deps.cancelUpload).toHaveBeenCalledWith(late.uploadId);
    expect(t.deps.uploadToTarget).not.toHaveBeenCalled();
    expect(t.state).toBe(IDLE);
  });

  it('cancels while requesting when the ticket then fails: nothing to discard', async () => {
    const issued = deferred<UploadTicketDto>();
    const t = setup({ requestUpload: () => issued.promise });
    t.controller.pick(file('jpeg'));
    await flush();
    t.controller.cancel();
    issued.reject(new ApiError('client.network', 0));
    await flush();
    expect(t.state).toBe(IDLE);
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
  });

  it('cancels while uploading: aborts the PUT and discards once', async () => {
    const put = deferred<undefined>();
    let signal: AbortSignal | undefined;
    const t = setup({
      uploadToTarget: (_target, _blob, opts) => {
        signal = opts.signal;
        return put.promise;
      },
    });
    t.controller.pick(file('jpeg'));
    await flush();
    expect(t.state.status).toBe('uploading');
    t.controller.cancel();
    expect(signal?.aborted).toBe(true);
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    put.reject(new DOMException('Aborted', 'AbortError'));
    await flush();
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    expect(t.state).toBe(IDLE);
    expect(t.revoked).toEqual(['blob:preview-1']);
  });

  it('cancels a ready file: discards the upload and revokes the preview', async () => {
    const t = setup();
    t.controller.pick(file('jpeg'));
    await flush();
    expect(t.state.status).toBe('ready');
    t.controller.cancel();
    expect(t.statuses.slice(-2)).toEqual(['cancelling', 'idle']);
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    expect(t.revoked).toEqual(['blob:preview-1']);
    expect(t.controller.handOff()).toBeNull();
  });

  it('cancels the current file first when another one is picked', async () => {
    const t = setup();
    t.controller.pick(file('jpeg', 'one.jpg'));
    await flush();
    const first = t.state.status === 'ready' ? t.state.uploadId : '';
    t.controller.pick(file('png', 'two.png'));
    expect(t.deps.cancelUpload).toHaveBeenCalledWith(first);
    await flush();
    expect(t.state).toMatchObject({ status: 'ready', fileName: 'two.png' });
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is nothing to cancel', () => {
    const t = setup();
    t.controller.cancel();
    expect(t.state).toBe(IDLE);
    expect(t.deps.cancelUpload).not.toHaveBeenCalled();
  });
});

describe('createAttachmentController: dispose (chat change, unmount)', () => {
  it('stops dispatching, aborts, discards once and revokes', async () => {
    const put = deferred<undefined>();
    const t = setup({ uploadToTarget: () => put.promise });
    t.controller.pick(file('jpeg'));
    await flush();
    const before = t.events.length;
    t.controller.dispose();
    put.resolve(undefined);
    await flush();
    expect(t.events.length).toBe(before);
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    expect(t.revoked).toEqual(['blob:preview-1']);
    t.controller.dispose();
    t.controller.cancel();
    t.controller.pick(file('jpeg'));
    expect(t.events.length).toBe(before);
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
  });

  it('discards a ticket that arrives after dispose', async () => {
    const issued = deferred<UploadTicketDto>();
    const t = setup({ requestUpload: () => issued.promise });
    t.controller.pick(file('jpeg'));
    await flush();
    t.controller.dispose();
    const before = t.events.length;
    issued.resolve(ticket());
    await flush();
    expect(t.deps.cancelUpload).toHaveBeenCalledTimes(1);
    expect(t.events.length).toBe(before);
  });

  it('discards every issued upload exactly once across a busy session', async () => {
    const t = setup();
    for (let i = 0; i < 4; i += 1) {
      t.controller.pick(file('jpeg', `${String(i)}.jpg`));
      await flush();
    }
    const sent = t.controller.handOff(); // the 4th goes out with a message
    t.controller.pick(file('png'));
    await flush();
    t.controller.dispose();
    const issued = vi
      .mocked(t.deps.requestUpload)
      .mock.results.map((r) => r.value as Promise<UploadTicketDto>); // results of the fake
    const ids = await Promise.all(issued.map(async (p) => (await p).uploadId));
    const discarded = vi.mocked(t.deps.cancelUpload).mock.calls.map(([id]) => id);
    expect(ids).toHaveLength(5);
    expect(discarded.sort()).toEqual(ids.filter((id) => id !== sent?.uploadId).sort());
  });
});

describe('previewsToRelease', () => {
  const row = (id: string, previewUrl: string | null): ThreadMessage =>
    ({ id, media: { status: 'ready', url: null, previewUrl } }) as ThreadMessage; // only id and media matter
  it('releases a preview once the server row has its own preview', () => {
    const pending = new Map([
      ['m1', 'blob:1'],
      ['m2', 'blob:2'],
    ]);
    expect(
      previewsToRelease(pending, [row('m1', null), row('m2', '/p.jpg'), row('m3', '/x')]),
    ).toEqual(['m2']);
    expect(previewsToRelease(new Map(), [row('m2', '/p.jpg')])).toEqual([]);
  });
});
