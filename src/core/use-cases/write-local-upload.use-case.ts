import type { StorageKey } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type WriteLocalUploadInput = {
  key: string;
  exp: string;
  sig: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
};

export type WriteLocalUploadOutput = { sizeBytes: number };

export type WriteLocalUploadDeps = Pick<AllPorts, 'storage' | 'clock' | 'logger'>;

const OUTBOUND_KEY = /^outbound\/[A-Za-z0-9_-]{22}\/(original\.(jpg|png|mp4)|preview\.jpg)$/;

export const makeWriteLocalUpload: (
  deps: WriteLocalUploadDeps,
  config: UseCaseConfig,
) => UseCase<
  WriteLocalUploadInput,
  WriteLocalUploadOutput,
  | 'upload.signature_invalid'
  | 'upload.expired'
  | 'upload.content_mismatch'
  | 'media.too_large'
  | 'storage.unavailable'
> =
  ({ storage, clock, logger }) =>
  async (input, ctx) => {
    if (!OUTBOUND_KEY.test(input.key)) {
      logger.log('warn', 'upload.local_put.rejected', {
        requestId: ctx.requestId,
        errorCode: 'upload.signature_invalid',
      });
      return err('upload.signature_invalid');
    }
    const result = await storage.acceptSignedPut(
      input.key as StorageKey,
      { exp: input.exp, sig: input.sig },
      input.contentType,
      input.body,
      clock.now(),
    );
    if (!result.ok) {
      logger.log('warn', 'upload.local_put.rejected', {
        requestId: ctx.requestId,
        errorCode: result.error.code,
      });
      return err(result.error.code);
    }
    return ok({ sizeBytes: result.value.sizeBytes });
  };
