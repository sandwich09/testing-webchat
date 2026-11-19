import { z } from 'zod';
import {
  AI_MODEL_IDS,
  AI_PROVIDERS,
  DELIVERY_STATUSES,
  DOCUMENT_STATUSES,
  ERROR_CODES,
  EVENT_CODES,
  FOLLOW_STATUSES,
  HANDOFF_REASONS,
  LINE_SECRET_STATUSES,
  MEDIA_STATUSES,
  MESSAGE_AUTHORS,
  MESSAGE_DIRECTIONS,
  MESSAGE_TYPES,
  OTHER_KINDS,
  POLITE_PARTICLES,
  PREVIEW_TEXT_MAX_CHARS,
  USAGE_KINDS,
  USAGE_OUTCOMES,
} from '@/core/domain';

// Shared DTOs of docs/architecture/api-contract.md ("DTO ร่วม"). Every object is strict.
// Screens import enum value arrays and types from here because they may not import the domain.

export {
  AI_MODEL_IDS,
  DELIVERY_STATUSES,
  DOCUMENT_STATUSES,
  ERROR_CODES,
  EVENT_CODES,
  FOLLOW_STATUSES,
  HANDOFF_REASONS,
  LINE_SECRET_STATUSES,
  MEDIA_STATUSES,
  MESSAGE_AUTHORS,
  MESSAGE_DIRECTIONS,
  MESSAGE_TYPES,
  OTHER_KINDS,
  POLITE_PARTICLES,
  USAGE_KINDS,
  USAGE_OUTCOMES,
} from '@/core/domain';
export type {
  AiModelId,
  DeliveryStatus,
  DocumentStatus,
  ErrorCode,
  EventCode,
  FollowStatus,
  HandoffReason,
  MediaStatus,
  MessageAuthor,
  MessageDirection,
  MessageType,
  OtherKind,
  PoliteParticle,
  UsageKind,
  UsageOutcome,
} from '@/core/domain';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 UTC from Date.toISOString(), for example "2026-11-18T07:32:10.123Z". */
export const isoDateSchema = z.iso.datetime();
/** Decimal digits of a bigint sequence value (up to 19 digits). */
export const seqStringSchema = z.string().regex(/^\d{1,19}$/);
/** Cost in dollars with 6 decimals, "0.012345" (formatUsd(n, 6)). */
export const usdCostStringSchema = z.string().regex(/^\d+\.\d{6}$/);
/** Budget in dollars with 2 decimals, "5.00" (formatUsd(n, 2)). */
export const usdBudgetStringSchema = z.string().regex(/^\d+\.\d{2}$/);
/** Opaque id from the server. Loose on purpose: a malformed id is answered 404, not 400. */
export const idSchema = z.string().min(1).max(100);
/** Upload id: 22 characters of base64url. */
export const uploadIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
/** Opaque cursor made by the server (base64url). The screens never decode it. */
export const opaqueCursorSchema = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);
/** Response body `{}`. */
export const emptyObjectSchema = z.strictObject({});

export const errorCodeSchema = z.enum(ERROR_CODES);
export const handoffReasonSchema = z.enum(HANDOFF_REASONS);
export const eventCodeSchema = z.enum(EVENT_CODES);

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export const contactDtoSchema = z.strictObject({
  id: idSchema,
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  followStatus: z.enum(FOLLOW_STATUSES),
  followedAt: isoDateSchema.nullable(),
  aiEnabled: z.boolean(),
  needsAdmin: z.boolean(),
  needsAdminReason: handoffReasonSchema.nullable(),
  aiReplying: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  lastMessage: z
    .strictObject({
      at: isoDateSchema,
      by: z.enum(['customer', 'admin', 'ai']),
      type: z.enum(['text', 'image', 'video', 'sticker', 'other']),
      text: z.string().max(PREVIEW_TEXT_MAX_CHARS).nullable(),
    })
    .nullable(),
  createdAt: isoDateSchema,
  updatedSeq: seqStringSchema,
});
export type ContactDto = z.infer<typeof contactDtoSchema>;

export const contactDetailDtoSchema = contactDtoSchema.extend({
  stats: z.strictObject({
    messageCount: z.number().int().nonnegative(),
    aiMessageCount: z.number().int().nonnegative(),
  }),
});
export type ContactDetailDto = z.infer<typeof contactDetailDtoSchema>;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export const messageDtoSchema = z.strictObject({
  id: idSchema,
  seq: seqStringSchema,
  updatedSeq: seqStringSchema,
  contactId: idSchema,
  direction: z.enum(MESSAGE_DIRECTIONS),
  author: z.enum(MESSAGE_AUTHORS),
  type: z.enum(MESSAGE_TYPES),
  text: z.string().nullable(),
  media: z
    .strictObject({
      status: z.enum(MEDIA_STATUSES),
      url: z.string().nullable(),
      previewUrl: z.string().nullable(),
    })
    .nullable(),
  sticker: z
    .strictObject({
      packageId: z.string(),
      stickerId: z.string(),
      imageUrl: z.string(),
    })
    .nullable(),
  otherKind: z.enum(OTHER_KINDS).nullable(),
  eventCode: eventCodeSchema.nullable(),
  delivery: z
    .strictObject({
      status: z.enum(DELIVERY_STATUSES),
      errorCode: errorCodeSchema.nullable(),
      /**
       * End of LINE's retry key window (LINE_RETRY_KEY_WINDOW_MS after the first push); from then
       * "send again" is refused with message.retry_expired. null while no push was attempted.
       */
      retryExpiresAt: isoDateSchema.nullable(),
    })
    .nullable(),
  createdAt: isoDateSchema,
  sentAt: isoDateSchema.nullable(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

// ---------------------------------------------------------------------------
// Settings and system
// ---------------------------------------------------------------------------

export const settingsDtoSchema = z.strictObject({
  ai: z.strictObject({
    enabled: z.boolean(),
    provider: z.enum(AI_PROVIDERS),
    model: z.enum(AI_MODEL_IDS),
    dailyBudgetUsd: usdBudgetStringSchema,
    todayCostUsd: usdCostStringSchema,
    politeParticle: z.enum(POLITE_PARTICLES),
    instructions: z.string(),
  }),
  guard: z.strictObject({
    enabled: z.boolean(),
    /** In the saved order. */
    topics: z.array(z.string()),
    refusalText: z.string(),
    /** AiUsage kind guard outcome blocked, today in Bangkok time. */
    blockedToday: z.number().int().nonnegative(),
  }),
  line: z.strictObject({
    configured: z.boolean(),
    status: z.enum(['connected', 'error', 'not_configured']),
    botName: z.string().nullable(),
    basicId: z.string().nullable(),
    /** Not secret, so it is returned and shown. null when none was saved. */
    channelId: z.string().nullable(),
    /** Whether LINE confirmed the stored channel secret for the Channel ID. */
    secretStatus: z.enum(LINE_SECRET_STATUSES),
    webhookUrl: z.string(),
    lastWebhookAt: isoDateSchema.nullable(),
  }),
  client: z.strictObject({
    pollIntervalMs: z.number().int().positive(),
  }),
});
export type SettingsDto = z.infer<typeof settingsDtoSchema>;

export const systemStatusDtoSchema = z.strictObject({
  lastWebhookAt: isoDateSchema.nullable(),
  lastLineError: z.strictObject({ code: errorCodeSchema, at: isoDateSchema }).nullable(),
  lastAiError: z.strictObject({ code: errorCodeSchema, at: isoDateSchema }).nullable(),
  todayCostUsd: usdCostStringSchema,
  dailyBudgetUsd: usdBudgetStringSchema,
  priceTableDate: z.string(),
  database: z.literal('ok'),
});
export type SystemStatusDto = z.infer<typeof systemStatusDtoSchema>;

const countSchema = z.number().int().nonnegative();

/** Every number is today's, in Bangkok time. */
export const guardrailStatsDtoSchema = z.strictObject({
  aiEnabled: z.boolean(),
  guardEnabled: z.boolean(),
  guardBlocked: countSchema,
  outputRejected: countSchema,
  handoffs: z.strictObject({
    notInKnowledge: countSchema,
    needsHuman: countSchema,
    failedOrTimeout: countSchema,
    other: countSchema,
  }),
  budgetReached: countSchema,
  nonText: countSchema,
});
export type GuardrailStatsDto = z.infer<typeof guardrailStatsDtoSchema>;

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export const documentDtoSchema = z.strictObject({
  id: idSchema,
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative().nullable(),
  tokenCount: z.number().int().nonnegative().nullable(),
  status: z.enum(DOCUMENT_STATUSES),
  errorCode: errorCodeSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type DocumentDto = z.infer<typeof documentDtoSchema>;

export const documentDetailDtoSchema = documentDtoSchema.extend({
  extractedText: z.string().nullable(),
});
export type DocumentDetailDto = z.infer<typeof documentDetailDtoSchema>;

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export const usageRowDtoSchema = z.strictObject({
  contactId: idSchema.nullable(),
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  replyCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: usdCostStringSchema,
});
export type UsageRowDto = z.infer<typeof usageRowDtoSchema>;

export const usageRecordDtoSchema = z.strictObject({
  id: idSchema,
  createdAt: isoDateSchema,
  kind: z.enum(USAGE_KINDS),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  costUsd: usdCostStringSchema,
  outcome: z.enum(USAGE_OUTCOMES),
});
export type UsageRecordDto = z.infer<typeof usageRecordDtoSchema>;

// ---------------------------------------------------------------------------
// Canned replies
// ---------------------------------------------------------------------------

export const cannedReplyDtoSchema = z.strictObject({
  id: idSchema,
  title: z.string(),
  text: z.string(),
  sortOrder: z.number().int(),
  updatedAt: isoDateSchema,
});
export type CannedReplyDto = z.infer<typeof cannedReplyDtoSchema>;

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const uploadTargetDtoSchema = z.discriminatedUnion('strategy', [
  z.strictObject({
    strategy: z.literal('http_put'),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    contentType: z.string(),
    maxSizeBytes: z.number().int().positive(),
  }),
  z.strictObject({
    strategy: z.literal('vercel_blob_client'),
    pathname: z.string(),
    clientToken: z.string(),
    contentType: z.string(),
    maxSizeBytes: z.number().int().positive(),
  }),
]);
export type UploadTargetDto = z.infer<typeof uploadTargetDtoSchema>;

export const uploadTicketDtoSchema = z.strictObject({
  uploadId: uploadIdSchema,
  expiresAt: isoDateSchema,
  original: uploadTargetDtoSchema,
  preview: uploadTargetDtoSchema,
});
export type UploadTicketDto = z.infer<typeof uploadTicketDtoSchema>;
