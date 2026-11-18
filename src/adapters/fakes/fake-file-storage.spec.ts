import { describe, expect, it } from 'vitest';
import type { StorageKey } from '@/core/domain';
import { FakeFileStorage } from './fake-file-storage';
import { describeFileStorageSuite } from './suites/file-storage.suite';

describeFileStorageSuite(() => new FakeFileStorage(), 'local_disk');

describe('FakeFileStorage test controls', () => {
  const key = 'a/b.png' as StorageKey;

  it('seed plants a file that inspect and read can see', async () => {
    const storage = new FakeFileStorage();
    storage.seed(key, Uint8Array.from([1, 2, 3]), 'image/png');
    const inspected = await storage.inspect(key);
    expect(inspected.ok && inspected.value.sizeBytes).toBe(3);
    expect((await storage.read(key)).ok).toBe(true);
  });

  it('setUnavailable makes every method return storage.unavailable', async () => {
    const storage = new FakeFileStorage();
    storage.setUnavailable(true);
    const codes = [
      await storage.inspect(key),
      await storage.read(key),
      await storage.delete(key),
      await storage.issueUpload({
        key,
        contentType: 'image/png',
        maxSizeBytes: 1,
        expiresAt: new Date(),
      }),
    ].map((r) => (r.ok ? 'ok' : r.error.code));
    expect(codes).toEqual(Array<string>(4).fill('storage.unavailable'));
  });

  it('builds public urls from the configured base url', async () => {
    const storage = new FakeFileStorage({ baseUrl: 'https://example.test' });
    storage.seed(key, Uint8Array.from([1]), 'image/png');
    const inspected = await storage.inspect(key);
    expect(inspected.ok && inspected.value.publicUrl).toBe(
      'https://example.test/api/local-storage/a/b.png',
    );
  });
});
