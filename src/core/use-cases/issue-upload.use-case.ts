import type { UploadId } from '@/core/domain';
import {
  PREVIEW_MAX_BYTES,
  UPLOAD_TICKET_TTL_MS,
  err,
  ok,
  outboundMediaRule,
  outboundStorageKeys,
} from '@/core/domain';
import type { UploadTarget } from '@/core/ports';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type IssueUploadInput = {
  kind: 'image' | 'video';
  contentType: string;
  sizeBytes: number;
  preview: { contentType: 'image/jpeg'; sizeBytes: number };
};

export type IssueUploadOutput = {
  uploadId: UploadId;
  expiresAt: Date;
  original: UploadTarget;
  preview: UploadTarget;
};

export type IssueUploadDeps = Pick<
  AllPorts,
  'storage' | 'rateLimits' | 'hasher' | 'ids' | 'clock' | 'logger'
>;

const inRange = (value: number, max: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= max;

export const makeIssueUpload: (
  deps: IssueUploadDeps,
  config: UseCaseConfig,
) => UseCase<
  IssueUploadInput,
  IssueUploadOutput,
  'upload.rate_limited' | 'upload.type_not_allowed' | 'upload.too_large' | 'storage.unavailable'
> = (deps, config) => {
  const { storage, ids, clock, logger } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);
  return async (input, ctx) => {
    const now = clock.now();
    const limit = await hitRateLimit('upload_ticket', ctx.clientIp ?? 'unknown', now);
    if (limit.limited) {
      return err('upload.rate_limited', undefined, limit.retryAfterSeconds);
    }

    const rule = outboundMediaRule(input.kind);
    if (!rule.contentTypes.includes(input.contentType)) {
      logger.log('warn', 'upload.ticket.rejected', {
        requestId: ctx.requestId,
        errorCode: 'upload.type_not_allowed',
      });
      return err('upload.type_not_allowed');
    }
    if (
      !inRange(input.sizeBytes, rule.maxBytes) ||
      !inRange(input.preview.sizeBytes, PREVIEW_MAX_BYTES)
    ) {
      return err('upload.too_large');
    }

    const uploadId = ids.randomToken() as UploadId;
    const keys = outboundStorageKeys(uploadId, input.contentType);
    const expiresAt = new Date(now.getTime() + UPLOAD_TICKET_TTL_MS);

    const original = await storage.issueUpload({
      key: keys.original,
      contentType: input.contentType,
      maxSizeBytes: rule.maxBytes,
      expiresAt,
    });
    if (!original.ok) return err('storage.unavailable');
    const preview = await storage.issueUpload({
      key: keys.preview,
      contentType: 'image/jpeg',
      maxSizeBytes: PREVIEW_MAX_BYTES,
      expiresAt,
    });
    if (!preview.ok) return err('storage.unavailable');

    logger.log('info', 'upload.ticket.issued', { requestId: ctx.requestId });
    return ok({ uploadId, expiresAt, original: original.value, preview: preview.value });
  };
};
