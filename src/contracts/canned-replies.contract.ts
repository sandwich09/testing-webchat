import { z } from 'zod';
import { CANNED_TEXT_MAX_CHARS, CANNED_TITLE_MAX_CHARS } from '@/core/domain';
import { cannedReplyDtoSchema, idSchema } from './dto.contract';

const titleSchema = z.string().trim().min(1).max(CANNED_TITLE_MAX_CHARS);
const textSchema = z.string().trim().min(1).max(CANNED_TEXT_MAX_CHARS);

/** GET /api/canned-replies. Sorted by sortOrder. */
export const listCannedRepliesResponseSchema = z.strictObject({
  cannedReplies: z.array(cannedReplyDtoSchema),
});
export type ListCannedRepliesResponse = z.infer<typeof listCannedRepliesResponseSchema>;

/** POST /api/canned-replies. Response 201 CannedReplyDto. */
export const createCannedReplyBodySchema = z.strictObject({
  title: titleSchema,
  text: textSchema,
});
export type CreateCannedReplyBody = z.infer<typeof createCannedReplyBodySchema>;

/** PATCH and DELETE /api/canned-replies/:id. */
export const cannedReplyParamsSchema = z.strictObject({ id: idSchema });
export type CannedReplyParams = z.infer<typeof cannedReplyParamsSchema>;

/** PATCH /api/canned-replies/:id. At least one field. Response 200 CannedReplyDto. */
export const updateCannedReplyBodySchema = z
  .strictObject({
    title: titleSchema.optional(),
    text: textSchema.optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateCannedReplyBody = z.infer<typeof updateCannedReplyBodySchema>;

// DELETE /api/canned-replies/:id: response 204.
