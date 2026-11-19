import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceTable, StorageKey, UploadId } from '@/core/domain';
import { FakeFileStorage, FakeLogger } from '@/adapters/fakes';
import { makeDiscardUpload } from './discard-upload.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config = { priceTable: {} as PriceTable } as UseCaseConfig;
const ctx: RequestContext = { requestId: 'req-1', clientIp: null };
const ID = 'AAAAAAAAAAAAAAAAAAAAAA' as UploadId;
const OTHER = 'BBBBBBBBBBBBBBBBBBBBBB';
const bytes = new Uint8Array([1, 2, 3]);

describe('DiscardUpload', () => {
  let storage: FakeFileStorage;
  let logger: FakeLogger;
  let run: ReturnType<typeof makeDiscardUpload>;

  beforeEach(() => {
    storage = new FakeFileStorage();
    logger = new FakeLogger();
    run = makeDiscardUpload({ storage, logger }, config);
  });

  it('deletes the original and the preview and leaves other uploads alone', async () => {
    storage.seed(`outbound/${ID}/original.mp4` as StorageKey, bytes, 'video/mp4');
    storage.seed(`outbound/${ID}/preview.jpg` as StorageKey, bytes, 'image/jpeg');
    storage.seed(`outbound/${OTHER}/original.jpg` as StorageKey, bytes, 'image/jpeg');
    const r = await run({ uploadId: ID }, ctx);
    expect(r.ok).toBe(true);
    expect([...storage.files.keys()]).toEqual([`outbound/${OTHER}/original.jpg`]);
    expect(logger.eventsOf()).toEqual(['upload.file.discarded']);
  });

  it.each(['jpg', 'png'])('deletes a %s original', async (ext) => {
    storage.seed(`outbound/${ID}/original.${ext}` as StorageKey, bytes, 'image/jpeg');
    expect((await run({ uploadId: ID }, ctx)).ok).toBe(true);
    expect(storage.files.size).toBe(0);
  });

  it('is ok for an upload with no files, and safe to repeat', async () => {
    expect((await run({ uploadId: ID }, ctx)).ok).toBe(true);
    expect((await run({ uploadId: ID }, ctx)).ok).toBe(true);
  });

  it('returns storage.unavailable when the store is down and logs no discard', async () => {
    storage.setUnavailable(true);
    const r = await run({ uploadId: ID }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'storage.unavailable' } });
    expect(logger.eventsOf()).toEqual([]);
  });
});
