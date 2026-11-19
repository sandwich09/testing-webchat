import { z } from 'zod';
import {
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_MODEL_IDS,
  GUARD_REFUSAL_MAX_CHARS,
  GUARD_TEST_MAX_CHARS,
  LINE_CHANNEL_ID_MAX_CHARS,
  LINE_SECRET_STATUSES,
  POLITE_PARTICLES,
  normalizeGuardTopics,
} from '@/core/domain';
import { settingsDtoSchema, usdCostStringSchema } from './dto.contract';

/** Dollars to whole cents. Input already matches ^\d+(\.\d{1,2})?$. parseUsd is not used so the schema needs no domain function. */
const toCents = (usd: string): number => {
  const [whole = '0', fraction = ''] = usd.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

const budgetInputSchema = z
  .string()
  .regex(/^\d{1,4}(\.\d{1,2})?$/)
  .refine((value) => toCents(value) <= toCents(AI_DAILY_BUDGET_MAX_USD), {
    message: 'Budget exceeds AI_DAILY_BUDGET_MAX_USD',
  });

/**
 * Topics as sent. Valid when normalizeGuardTopics reports no issue and no entry is empty after
 * trimming (an empty entry is rejected, not dropped). The value stays as sent; UpdateSettings
 * trims it with normalizeGuardTopics.
 */
const guardTopicsInputSchema = z
  .array(z.string())
  .refine((topics) => topics.every((t) => t.trim() !== ''), {
    message: 'A topic is empty',
  })
  .refine((topics) => normalizeGuardTopics(topics).issue === null, {
    message: 'Too many, too long or duplicate topics',
  });

/** GET /api/settings. Never carries the channel secret or access token. */
export const getSettingsResponseSchema = settingsDtoSchema;

/** PATCH /api/settings. At least one field. Response 200 SettingsDto. */
export const updateSettingsBodySchema = z
  .strictObject({
    aiEnabled: z.boolean().optional(),
    aiModel: z.enum(AI_MODEL_IDS).optional(),
    aiDailyBudgetUsd: budgetInputSchema.optional(),
    aiPoliteParticle: z.enum(POLITE_PARTICLES).optional(),
    aiInstructions: z.string().max(AI_INSTRUCTIONS_MAX_CHARS).optional(),
    guardEnabled: z.boolean().optional(),
    guardTopics: guardTopicsInputSchema.optional(),
    guardRefusalText: z.string().trim().min(1).max(GUARD_REFUSAL_MAX_CHARS).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
export const updateSettingsResponseSchema = settingsDtoSchema;

/** POST /api/settings/guard/test. Uses the saved topics; the body has none. */
export const testTopicGuardBodySchema = z.strictObject({
  text: z.string().trim().min(1).max(GUARD_TEST_MAX_CHARS),
});
export type TestTopicGuardBody = z.infer<typeof testTopicGuardBodySchema>;

export const testTopicGuardResponseSchema = z.strictObject({
  allowed: z.boolean(),
  matchedTopic: z.string().nullable(),
  /** 6 decimals. */
  costUsd: usdCostStringSchema,
});
export type TestTopicGuardResponse = z.infer<typeof testTopicGuardResponseSchema>;

/** A LINE Channel ID: digits only, at most LINE_CHANNEL_ID_MAX_CHARS. Shared with the form. */
export const LINE_CHANNEL_ID_PATTERN = new RegExp(`^\\d{1,${String(LINE_CHANNEL_ID_MAX_CHARS)}}$`);

/** PUT /api/settings/line-credentials. No whitespace anywhere in any value. */
export const setLineCredentialsBodySchema = z.strictObject({
  channelId: z.string().regex(LINE_CHANNEL_ID_PATTERN),
  channelSecret: z.string().min(1).max(200).regex(/^\S+$/),
  channelAccessToken: z.string().min(1).max(1000).regex(/^\S+$/),
});
export type SetLineCredentialsBody = z.infer<typeof setLineCredentialsBodySchema>;

/**
 * Response of PUT /api/settings/line-credentials and POST /api/settings/line/test. A save answers
 * `verified` or `unchecked` (LINE could not check the secret now); a test may also answer
 * `no_channel_id` when none is stored.
 */
export const lineBotInfoResponseSchema = z.strictObject({
  botName: z.string(),
  basicId: z.string(),
  secretStatus: z.enum(LINE_SECRET_STATUSES),
});
export type LineBotInfoResponse = z.infer<typeof lineBotInfoResponseSchema>;
