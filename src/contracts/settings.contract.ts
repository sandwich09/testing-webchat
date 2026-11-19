import { z } from 'zod';
import {
  AI_ANSWER_MODES,
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_MODEL_IDS,
  AI_NAME_MAX_CHARS,
  GUARD_TEST_MAX_CHARS,
  HOW_TO_TEXT_MAX_CHARS,
  WELCOME_TEXT_MAX_CHARS,
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

/**
 * The AI name as sent: one line without control characters, at most AI_NAME_MAX_CHARS after
 * trimming. '' clears the name.
 */
const aiNameInputSchema = z
  .string()
  .trim()
  .max(AI_NAME_MAX_CHARS)
  // eslint-disable-next-line no-control-regex -- control characters are what is rejected
  .regex(/^[^\u0000-\u001f\u007f]*$/);

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
    aiName: aiNameInputSchema.optional(),
    aiAnswerMode: z.enum(AI_ANSWER_MODES).optional(),
    guardEnabled: z.boolean().optional(),
    guardTopics: guardTopicsInputSchema.optional(),
    /** '' (or only spaces) goes back to the default text. */
    howToText: z.string().trim().max(HOW_TO_TEXT_MAX_CHARS).optional(),
    welcomeEnabled: z.boolean().optional(),
    welcomeText: z.string().trim().max(WELCOME_TEXT_MAX_CHARS).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
export const updateSettingsResponseSchema = settingsDtoSchema;

/** POST /api/settings/rich-menu (publish) and DELETE (remove): no body. Response 200 SettingsDto. */
export const richMenuResponseSchema = settingsDtoSchema;

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

/**
 * PUT /api/settings/line-credentials. No whitespace anywhere in any value. Only the values the
 * admin changed are sent (at least one); the server takes the others from what is stored.
 */
export const setLineCredentialsBodySchema = z
  .strictObject({
    channelId: z.string().regex(LINE_CHANNEL_ID_PATTERN).optional(),
    channelSecret: z.string().min(1).max(200).regex(/^\S+$/).optional(),
    channelAccessToken: z.string().min(1).max(1000).regex(/^\S+$/).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one value',
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
