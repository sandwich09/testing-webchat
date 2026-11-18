import { z } from 'zod';
import { emptyObjectSchema } from './dto.contract';

/** `*key` of /api/local-storage/*key as Next.js gives it: path segments, never "." or "..". */
export const localStorageParamsSchema = z.strictObject({
  key: z
    .array(
      z
        .string()
        .min(1)
        .regex(/^[^/\\]+$/)
        .refine((segment) => segment !== '.' && segment !== '..'),
    )
    .min(1),
});
export type LocalStorageParams = z.infer<typeof localStorageParamsSchema>;

/**
 * PUT /api/local-storage/*key query. `exp` is epoch seconds; `sig` is
 * `<maxSizeBytes>.<base64url(contentType)>.<base64url(HMAC)>`.
 */
export const writeLocalUploadQuerySchema = z.strictObject({
  exp: z.string().regex(/^\d{1,12}$/),
  sig: z
    .string()
    .min(1)
    .max(200)
    .regex(/^\d{1,12}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
});
export type WriteLocalUploadQuery = z.infer<typeof writeLocalUploadQuerySchema>;
export const writeLocalUploadResponseSchema = emptyObjectSchema;

// GET /api/local-storage/*key: params only, the response body is the raw file.
