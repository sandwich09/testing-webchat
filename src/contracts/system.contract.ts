import { z } from 'zod';
import { guardrailStatsDtoSchema, systemStatusDtoSchema } from './dto.contract';

/** GET /api/health. Open endpoint; 503 db.unavailable otherwise. */
export const healthResponseSchema = z.strictObject({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** GET /api/system/status. */
export const systemStatusResponseSchema = systemStatusDtoSchema;

/** GET /api/system/guardrails. The settings page polls it every SYSTEM_STATUS_POLL_MS. */
export const guardrailStatsResponseSchema = guardrailStatsDtoSchema;
