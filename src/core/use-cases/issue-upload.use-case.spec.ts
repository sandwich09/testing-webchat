import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceTable } from '@/core/domain';
import {
  IMAGE_MAX_BYTES,
  PREVIEW_MAX_BYTES,
  RATE_LIMIT_RULES,
  UPLOAD_TICKET_TTL_MS,
  VIDEO_MAX_BYTES,
} from '@/core/domain';
import {
  FakeClock,
  FakeContentHasher,
  FakeFileStorage,
  FakeIdGenerator,
  FakeLogger,
  FakeRateLimitRepository,
} from '@/adapters/fakes';
import { makeIssueUpload } from './issue-upload.use-case';
import type { IssueUploadInput } from './issue-upload.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.test',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 0,
  rateLimitScale: 1,
  priceTable: {} as PriceTable,
};
const ctx: RequestContext = { requestId: 'req-1', clientIp: '203.0.113.7' };
const preview = { contentType: 'image/jpeg', sizeBytes: 1000 } as const;
const jpeg: IssueUploadInput = {
  kind: 'image',
  contentType: 'image/jpeg',
  sizeBytes: 2 * 1024 * 1024,
  preview,
};

describe('IssueUpload', () => {
  let storage: FakeFileStorage;
  let clock: FakeClock;
  let logger: FakeLogger;
  let run: ReturnType<typeof makeIssueUpload>;

  beforeEach(() => {
    storage = new FakeFileStorage();
    clock = new FakeClock();
    logger = new FakeLogger(clock);
    run = makeIssueUpload(
      {
        storage,
        rateLimits: new FakeRateLimitRepository(),
        hasher: new FakeContentHasher(),
        ids: new FakeIdGenerator(clock),
        clock,
        logger,
      },
      config,
    );
  });

  it('issues two targets under one uploadId for a JPEG, each signed for the exact declared size', async () => {
    const r = await run(jpeg, ctx);
    if (!r.ok) throw new Error('expected ok');
    const id = r.value.uploadId;
    expect(r.value.original.key).toBe(`outbound/${id}/original.jpg`);
    expect(r.value.preview.key).toBe(`outbound/${id}/preview.jpg`);
    expect(r.value.original.maxSizeBytes).toBe(jpeg.sizeBytes);
    expect(r.value.preview.maxSizeBytes).toBe(jpeg.preview.sizeBytes);
    expect(logger.eventsOf()).toEqual(['upload.ticket.issued']);
  });

  it('issues a PNG key with .png', async () => {
    const r = await run({ ...jpeg, contentType: 'image/png' }, ctx);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.original.key.endsWith('/original.png')).toBe(true);
  });

  it('issues an MP4 key with .mp4 within the video limit', async () => {
    const r = await run(
      { ...jpeg, kind: 'video', contentType: 'video/mp4', sizeBytes: VIDEO_MAX_BYTES },
      ctx,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.original.key.endsWith('/original.mp4')).toBe(true);
    expect(r.value.original.maxSizeBytes).toBe(VIDEO_MAX_BYTES);
  });

  it.each(['video/quicktime', 'image/heic'])('rejects %s', async (contentType) => {
    const kind = contentType.startsWith('video') ? 'video' : 'image';
    const r = await run({ ...jpeg, kind, contentType }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.type_not_allowed' } });
    expect(logger.eventsOf()).toEqual(['upload.ticket.rejected']);
  });

  it('rejects a video type sent as an image', async () => {
    const r = await run({ ...jpeg, contentType: 'video/mp4' }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.type_not_allowed' } });
  });

  it('accepts exactly the maximum and rejects one byte more', async () => {
    expect((await run({ ...jpeg, sizeBytes: IMAGE_MAX_BYTES }, ctx)).ok).toBe(true);
    const r = await run({ ...jpeg, sizeBytes: IMAGE_MAX_BYTES + 1 }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.too_large' } });
  });

  it('rejects a preview over PREVIEW_MAX_BYTES', async () => {
    const r = await run(
      { ...jpeg, preview: { contentType: 'image/jpeg', sizeBytes: PREVIEW_MAX_BYTES + 1 } },
      ctx,
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.too_large' } });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects size %s', async (sizeBytes) => {
    const r = await run({ ...jpeg, sizeBytes }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.too_large' } });
  });

  it('rejects an empty preview', async () => {
    const r = await run({ ...jpeg, preview: { contentType: 'image/jpeg', sizeBytes: 0 } }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.too_large' } });
  });

  it('rate limits after the allowed hits, with retryAfterSeconds, before any storage call', async () => {
    const limit = RATE_LIMIT_RULES.upload_ticket.limit;
    for (let i = 0; i < limit; i += 1) expect((await run(jpeg, ctx)).ok).toBe(true);
    const r = await run(jpeg, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.rate_limited' } });
    if (r.ok) throw new Error('expected error');
    expect(r.error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts the rate limit before validating the type', async () => {
    const limit = RATE_LIMIT_RULES.upload_ticket.limit;
    for (let i = 0; i < limit; i += 1) await run({ ...jpeg, contentType: 'image/heic' }, ctx);
    const r = await run({ ...jpeg, contentType: 'image/heic' }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'upload.rate_limited' } });
  });

  it('handles an unknown client IP', async () => {
    expect((await run(jpeg, { ...ctx, clientIp: null })).ok).toBe(true);
  });

  it('gives different uploadIds that are 22-char tokens, not UUIDs', async () => {
    const a = await run(jpeg, ctx);
    const b = await run(jpeg, ctx);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.value.uploadId).not.toBe(b.value.uploadId);
    expect(a.value.uploadId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('sets expiresAt to now plus the ticket TTL', async () => {
    const r = await run(jpeg, ctx);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.expiresAt.getTime()).toBe(clock.now().getTime() + UPLOAD_TICKET_TTL_MS);
  });

  it('returns storage.unavailable when the store is down', async () => {
    storage.setUnavailable(true);
    const r = await run(jpeg, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'storage.unavailable' } });
  });

  it('returns storage.unavailable when only the preview ticket fails', async () => {
    const original = storage.issueUpload.bind(storage);
    storage.issueUpload = async (spec) => {
      if (spec.key.endsWith('preview.jpg')) storage.setUnavailable(true);
      return original(spec);
    };
    const r = await run(jpeg, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'storage.unavailable' } });
  });
});
