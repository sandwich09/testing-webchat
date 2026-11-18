import { z } from 'zod';

/** POST /api/access/unlock. Response 204 with Set-Cookie, no body. */
export const unlockBodySchema = z.strictObject({
  // The cap only guards against malformed requests; it is not a rule of the code itself.
  code: z.string().trim().min(1).max(200),
});
export type UnlockBody = z.infer<typeof unlockBodySchema>;

// POST /api/access/lock: no body, no query, response 204.
