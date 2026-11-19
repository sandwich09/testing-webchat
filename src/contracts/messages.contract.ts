import { z } from 'zod';
import { ADMIN_TEXT_MAX_CHARS, MESSAGE_PAGE_LIMIT } from '@/core/domain';
import { messageDtoSchema, pathIdSchema, seqStringSchema, uploadIdSchema } from './dto.contract';

/** Path of GET and POST /api/contacts/:id/messages. */
export const messagesParamsSchema = z.strictObject({ id: pathIdSchema('contact.not_found') });
export type MessagesParams = z.infer<typeof messagesParamsSchema>;

/** Path of POST /api/contacts/:id/messages/:messageId/retry. Empty body, response 200 MessageDto. */
/** RetryMessage answers message.not_found for a message of another or unknown contact. */
export const retryMessageParamsSchema = z.strictObject({
  id: pathIdSchema('message.not_found'),
  messageId: pathIdSchema('message.not_found'),
});
export type RetryMessageParams = z.infer<typeof retryMessageParamsSchema>;
export const retryMessageResponseSchema = messageDtoSchema;

const limitSchema = z
  .string()
  .regex(/^\d{1,4}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(MESSAGE_PAGE_LIMIT));

/**
 * GET /api/contacts/:id/messages. At most one of beforeSeq and afterUpdatedSeq.
 * `limit` is ignored in polling mode (the server uses POLL_PAGE_LIMIT).
 */
export const getMessagesQuerySchema = z
  .strictObject({
    beforeSeq: seqStringSchema.optional(),
    afterUpdatedSeq: seqStringSchema.optional(),
    limit: limitSchema.optional(),
  })
  .refine((query) => query.beforeSeq === undefined || query.afterUpdatedSeq === undefined, {
    message: 'beforeSeq and afterUpdatedSeq cannot be used together',
  });
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;

export const getMessagesResponseSchema = z.strictObject({
  messages: z.array(messageDtoSchema),
  hasOlder: z.boolean().nullable(),
  hasMore: z.boolean(),
  highWater: seqStringSchema,
});
export type GetMessagesResponse = z.infer<typeof getMessagesResponseSchema>;

/** POST /api/contacts/:id/messages. `id` is a UUID made by the browser. */
export const sendMessageBodySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: z.uuid(),
    kind: z.literal('text'),
    text: z.string().trim().min(1).max(ADMIN_TEXT_MAX_CHARS),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal('image'),
    uploadId: uploadIdSchema,
    contentType: z.enum(['image/jpeg', 'image/png']),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal('video'),
    uploadId: uploadIdSchema,
    contentType: z.literal('video/mp4'),
  }),
]);
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export const sendMessageResponseSchema = messageDtoSchema;
