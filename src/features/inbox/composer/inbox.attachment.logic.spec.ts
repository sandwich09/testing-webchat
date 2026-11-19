import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/common/error-messages';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '@/contracts';

import { copy } from '../inbox.constants';
import type { ThreadMessage } from '../inbox.logic';
import {
  attachmentErrorCode,
  attachmentErrorText,
  attachmentReducer,
  conversionFor,
  IDLE,
  isAttachmentPending,
  previewsToRelease,
  trayView,
  type Attachment,
  type AttachmentEvent,
  attachHintText,
  mbText,
} from './inbox.attachment.logic';

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

  it('names the accepted types, both limits and the file size when the server refuses a file', () => {
    const limits = { imageMaxMb: mbText(IMAGE_MAX_BYTES), videoMaxMb: mbText(VIDEO_MAX_BYTES) };
    const tooLarge = `ไฟล์ใหญ่เกินไป รูปต้องไม่เกิน ${limits.imageMaxMb} MB และวิดีโอไม่เกิน ${limits.videoMaxMb} MB ไฟล์นี้ 61.2 MB`;
    expect(attachmentErrorText({ kind: 'request', code: 'upload.too_large', sizeMb: '61.2' })).toBe(
      tooLarge,
    );
    expect(attachmentErrorText({ kind: 'upload', code: 'media.too_large', sizeMb: '61.2' })).toBe(
      tooLarge,
    );
    expect(attachmentErrorText({ kind: 'request', code: 'upload.type_not_allowed' })).toContain(
      'JPEG, PNG, WebP, HEIC และวิดีโอ MP4',
    );
    expect(attachmentErrorText({ kind: 'upload', code: 'upload.incomplete' })).toBe(
      errorMessage('upload.incomplete'),
    );
    expect(attachmentErrorText({ kind: 'check', code: 'mov_not_supported' })).toContain('MP4');
    for (const text of [tooLarge, attachHintText()]) expect(text).not.toMatch(/\{\w+\}/);
  });

  it('gives the attach hint the accepted types and both limits from the constants', () => {
    const hint = attachHintText();
    expect(hint).toContain('JPEG, PNG, WebP, HEIC');
    expect(hint).toContain('MP4');
    expect(hint).toContain(`${mbText(IMAGE_MAX_BYTES)} MB`);
    expect(hint).toContain(`${mbText(VIDEO_MAX_BYTES)} MB`);
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
