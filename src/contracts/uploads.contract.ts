import { z } from 'zod';
import { uploadIdSchema, uploadTicketDtoSchema } from './dto.contract';

/** POST /api/uploads. The use case checks the allowed content types and sizes. */
export const issueUploadBodySchema = z.strictObject({
  kind: z.enum(['image', 'video']),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(1),
  preview: z.strictObject({
    contentType: z.literal('image/jpeg'),
    sizeBytes: z.number().int().min(1),
  }),
});
export type IssueUploadBody = z.infer<typeof issueUploadBodySchema>;
export const issueUploadResponseSchema = uploadTicketDtoSchema;

/** DELETE /api/uploads/:uploadId. Response 204. */
export const discardUploadParamsSchema = z.strictObject({ uploadId: uploadIdSchema });
export type DiscardUploadParams = z.infer<typeof discardUploadParamsSchema>;
