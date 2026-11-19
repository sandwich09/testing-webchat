import type { StorageKey, UploadId } from '@/core/domain';
import { err, ok, outboundStorageKeys } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type DiscardUploadInput = { uploadId: UploadId };

export type DiscardUploadDeps = Pick<AllPorts, 'storage' | 'logger'>;

const ORIGINAL_TYPES = ['image/jpeg', 'image/png', 'video/mp4'] as const;

/** Every key an upload can have: three possible originals and one preview. */
const keysOf = (uploadId: UploadId): StorageKey[] => {
  const originals = ORIGINAL_TYPES.map((type) => outboundStorageKeys(uploadId, type).original);
  return [...originals, outboundStorageKeys(uploadId, 'image/jpeg').preview];
};

export const makeDiscardUpload: (
  deps: DiscardUploadDeps,
  config: UseCaseConfig,
) => UseCase<DiscardUploadInput, void, 'storage.unavailable'> =
  ({ storage, logger }) =>
  async (input, ctx) => {
    let unavailable = false;
    for (const key of keysOf(input.uploadId)) {
      const deleted = await storage.delete(key);
      if (!deleted.ok) unavailable = true;
    }
    if (unavailable) return err('storage.unavailable');
    logger.log('info', 'upload.file.discarded', { requestId: ctx.requestId });
    return ok(undefined);
  };
