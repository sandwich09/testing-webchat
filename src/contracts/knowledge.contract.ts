import { z } from 'zod';
import { documentDetailDtoSchema, documentDtoSchema, pathIdSchema } from './dto.contract';

/** Name of the single multipart part of POST /api/knowledge/documents and .../:id/retry. */
export const KNOWLEDGE_FILE_FIELD = 'file';

/** GET /api/knowledge/documents. Polled only while a row is processing. */
export const listDocumentsResponseSchema = z.strictObject({
  documents: z.array(documentDtoSchema),
  usedTokens: z.number().int().nonnegative(),
  capacityTokens: z.number().int().nonnegative(),
});
export type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;

/**
 * Facts about the `file` part, read by the route from the multipart form, because a form body
 * cannot be parsed by zod directly. Size and type are judged by the use case (knowledge.file_too_large,
 * knowledge.not_pdf), so no size cap here.
 */
export const knowledgeFilePartSchema = z.strictObject({
  fileName: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative(),
});
export type KnowledgeFilePart = z.infer<typeof knowledgeFilePartSchema>;

/** POST /api/knowledge/documents. Response 202 DocumentDto (processing). */
export const ingestDocumentResponseSchema = documentDtoSchema;

/** GET and DELETE /api/knowledge/documents/:id, POST .../:id/retry. */
export const documentParamsSchema = z.strictObject({ id: pathIdSchema('knowledge.not_found') });
export type DocumentParams = z.infer<typeof documentParamsSchema>;

export const getDocumentResponseSchema = documentDetailDtoSchema;
export const retryDocumentResponseSchema = documentDtoSchema;

// DELETE /api/knowledge/documents/:id: response 204.
