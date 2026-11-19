import { z } from 'zod';
import { CONTACT_SEARCH_MAX_CHARS } from '@/core/domain';
import {
  contactDetailDtoSchema,
  contactDtoSchema,
  idSchema,
  opaqueCursorSchema,
  seqStringSchema,
} from './dto.contract';

export const CONTACT_FILTERS = ['all', 'unread', 'needs_admin'] as const;
export type ContactFilter = (typeof CONTACT_FILTERS)[number];
/** Applied by the use case when `filter` is absent in page mode. */
export const DEFAULT_CONTACT_FILTER: ContactFilter = 'all';

/** Path of every /api/contacts/:id endpoint. */
export const contactParamsSchema = z.strictObject({ id: idSchema });
export type ContactParams = z.infer<typeof contactParamsSchema>;

/**
 * GET /api/contacts. Either page mode (filter, q, before) or polling mode (afterUpdatedSeq alone).
 * Query values arrive as strings.
 */
export const listContactsQuerySchema = z
  .strictObject({
    filter: z.enum(CONTACT_FILTERS).optional(),
    q: z.string().min(1).max(CONTACT_SEARCH_MAX_CHARS).optional(),
    before: opaqueCursorSchema.optional(),
    afterUpdatedSeq: seqStringSchema.optional(),
  })
  .refine(
    (query) =>
      query.afterUpdatedSeq === undefined ||
      (query.filter === undefined && query.q === undefined && query.before === undefined),
    { message: 'afterUpdatedSeq cannot be combined with filter, q or before' },
  );
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

export const listContactsResponseSchema = z.strictObject({
  contacts: z.array(contactDtoSchema),
  before: opaqueCursorSchema.nullable(),
  hasMore: z.boolean(),
  highWater: seqStringSchema,
  counts: z.strictObject({
    all: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
    needsAdmin: z.number().int().nonnegative(),
  }),
  lineConfigured: z.boolean(),
});
export type ListContactsResponse = z.infer<typeof listContactsResponseSchema>;

/** GET /api/contacts/:id. */
export const getContactResponseSchema = contactDetailDtoSchema;

/** PATCH /api/contacts/:id. Response 200 ContactDto. */
export const setContactAiBodySchema = z.strictObject({ aiEnabled: z.boolean() });
export type SetContactAiBody = z.infer<typeof setContactAiBodySchema>;
export const setContactAiResponseSchema = contactDtoSchema;

/** POST /api/contacts/:id/read. Empty body, response 200 ContactDto. */
export const markContactReadResponseSchema = contactDtoSchema;

/** POST /api/contacts/:id/typing. Empty body. Beyond the rate limit it answers shown: false. */
export const typingResponseSchema = z.strictObject({ shown: z.boolean() });
export type TypingResponse = z.infer<typeof typingResponseSchema>;
