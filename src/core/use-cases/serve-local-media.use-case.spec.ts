import { beforeEach, describe, expect, it } from 'vitest';
import type { PriceTable, StorageKey } from '@/core/domain';
import { FakeFileStorage } from '@/adapters/fakes';
import { makeServeLocalMedia } from './serve-local-media.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const config = { priceTable: {} as PriceTable } as UseCaseConfig;
const ctx: RequestContext = { requestId: 'req-1', clientIp: null };
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';

describe('ServeLocalMedia', () => {
  let storage: FakeFileStorage;
  let run: ReturnType<typeof makeServeLocalMedia>;

  beforeEach(() => {
    storage = new FakeFileStorage();
    run = makeServeLocalMedia({ storage }, config);
  });

  it.each([
    ['inbound', 'original.png', 'image/png'],
    ['outbound', 'original.mp4', 'video/mp4'],
    ['outbound', 'preview.jpg', 'image/jpeg'],
  ])('streams %s/%s with its stored content type', async (dir, file, type) => {
    storage.seed(`${dir}/${TOKEN}/${file}` as StorageKey, new Uint8Array([1, 2, 3]), type);
    const r = await run({ key: `${dir}/${TOKEN}/${file}` }, ctx);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.contentType).toBe(type);
    expect(r.value.sizeBytes).toBe(3);
    const chunk = await r.value.stream.getReader().read();
    expect([...(chunk.value ?? [])]).toEqual([1, 2, 3]);
  });

  it('serves the key the Docker seed stores its sample image under (prisma/seed.ts)', async () => {
    const key = 'inbound/seed-latte-sample-0001/original.jpg';
    storage.seed(key as StorageKey, new Uint8Array([9]), 'image/jpeg');
    const r = await run({ key }, ctx);
    expect(r.ok).toBe(true);
  });

  it.each([
    `outbound/../${TOKEN}/original.jpg`,
    `outbound/${TOKEN}/../original.jpg`,
    `../outbound/${TOKEN}/original.jpg`,
    `other/${TOKEN}/original.jpg`,
    `outbound/${TOKEN}/original.gif`,
    `outbound/${TOKEN}/original.jpg\n`,
    '',
  ])('rejects key %j with media.not_found', async (key) => {
    storage.seed(key as StorageKey, new Uint8Array([1]), 'image/jpeg');
    const r = await run({ key }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'media.not_found' } });
  });

  it('returns media.not_found when the file is missing', async () => {
    const r = await run({ key: `outbound/${TOKEN}/original.jpg` }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'media.not_found' } });
  });

  it('maps storage.unavailable to media.not_found', async () => {
    storage.setUnavailable(true);
    const r = await run({ key: `outbound/${TOKEN}/original.jpg` }, ctx);
    expect(r).toMatchObject({ ok: false, error: { code: 'media.not_found' } });
  });
});
