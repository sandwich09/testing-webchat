import type { StorageKey } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ServeLocalMediaInput = { key: string };

export type ServeLocalMediaOutput = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  sizeBytes: number;
};

export type ServeLocalMediaDeps = Pick<AllPorts, 'storage'>;

const MEDIA_KEY =
  /^(inbound|outbound)\/[A-Za-z0-9_-]{22}\/(original\.(jpg|png|mp4|m4a|mp3|aac)|preview\.jpg)$/;

export const makeServeLocalMedia: (
  deps: ServeLocalMediaDeps,
  config: UseCaseConfig,
) => UseCase<ServeLocalMediaInput, ServeLocalMediaOutput, 'media.not_found'> =
  ({ storage }) =>
  async (input) => {
    if (!MEDIA_KEY.test(input.key)) return err('media.not_found');
    const result = await storage.read(input.key as StorageKey);
    // storage.unavailable is reported as not found: the URL is public and says nothing more.
    if (!result.ok) return err('media.not_found');
    return ok(result.value);
  };
