import { z } from 'zod';
import {
  pathIdSchema,
  usageRecordDtoSchema,
  usageRowDtoSchema,
  usdCostStringSchema,
} from './dto.contract';

const tokenCountSchema = z.number().int().nonnegative();

/** GET /api/usage and GET /api/usage/contacts/:id query. Default is the current month in Bangkok time. */
export const usageQuerySchema = z.strictObject({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type UsageQuery = z.infer<typeof usageQuerySchema>;

/** One separate row of the report: count, tokens and cost of a kind. */
const usageSummaryRowSchema = z.strictObject({
  count: tokenCountSchema,
  inputTokens: tokenCountSchema,
  outputTokens: tokenCountSchema,
  cacheReadTokens: tokenCountSchema,
  cacheWriteTokens: tokenCountSchema,
  totalTokens: tokenCountSchema,
  costUsd: usdCostStringSchema,
});

export const usageReportResponseSchema = z.strictObject({
  month: z.string(),
  priceTableDate: z.string(),
  contacts: z.array(usageRowDtoSchema),
  ingest: usageSummaryRowSchema,
  /** Topic guard checks, the settings-page tests included. */
  guard: usageSummaryRowSchema,
  /** Contacts + ingest + guard. */
  totalCostUsd: usdCostStringSchema,
  replyCount: tokenCountSchema,
  averageCostPerReplyUsd: usdCostStringSchema.nullable(),
  /** Calls sent without an answer (ai.no_response): may be billed, so the total may be low. */
  noResponseCount: tokenCountSchema,
});
export type UsageReportResponse = z.infer<typeof usageReportResponseSchema>;

/** A well-formed unknown id gives an empty list; a malformed one is answered contact.not_found. */
export const contactUsageParamsSchema = z.strictObject({ id: pathIdSchema('contact.not_found') });
export type ContactUsageParams = z.infer<typeof contactUsageParamsSchema>;

export const contactUsageResponseSchema = z.strictObject({
  records: z.array(usageRecordDtoSchema),
});
export type ContactUsageResponse = z.infer<typeof contactUsageResponseSchema>;
