import { z } from 'zod';
import { errorCodeSchema } from './dto.contract';

/** Error body of every non-2xx response (api-contract "รูปแบบ error"). `client.network` never travels. */
export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
