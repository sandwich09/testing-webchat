import { z } from 'zod';
import { emptyObjectSchema } from './dto.contract';

// POST /api/line/webhook. Strict only on the fields the adapter reads; everything else passes
// through (code-style section 5). The route reads the raw text first and checks the signature
// before any parsing, so this schema runs on the parsed body after that.

/** Header `x-line-signature`. */
export const webhookHeadersSchema = z.looseObject({
  'x-line-signature': z.string().min(1),
});

const webhookMessageSchema = z.looseObject({
  id: z.string().optional(),
  type: z.string(),
  text: z.string().optional(),
  packageId: z.string().optional(),
  stickerId: z.string().optional(),
  contentProvider: z.looseObject({ type: z.string() }).optional(),
});

const webhookEventSchema = z.looseObject({
  type: z.string(),
  webhookEventId: z.string().optional(),
  timestamp: z.number().optional(),
  mode: z.string().optional(),
  replyToken: z.string().optional(),
  deliveryContext: z.looseObject({ isRedelivery: z.boolean().optional() }).optional(),
  source: z.looseObject({ type: z.string(), userId: z.string().optional() }).optional(),
  message: webhookMessageSchema.optional(),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const lineWebhookBodySchema = z.looseObject({
  events: z.array(webhookEventSchema),
});
export type LineWebhookBody = z.infer<typeof lineWebhookBodySchema>;

/** Response 200 `{}`. */
export const webhookResponseSchema = emptyObjectSchema;
