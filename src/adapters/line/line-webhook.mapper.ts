import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  InboundLineMessage,
  LineEvent,
  LineMessageId,
  LineUserId,
  OtherKind,
  Result,
  WebhookEventId,
} from '@/core/domain';
import { POSTBACK_DATA_MAX_CHARS, err, ok } from '@/core/domain';

// Translates the LINE webhook body into LineEvent. Strict only on the fields listed in
// docs/architecture/api-contract.md (POST /api/line/webhook); every other field passes through.

/** HMAC-SHA256 of the raw body with the channel secret, base64, compared in constant time. */
export const verifyLineSignature = (
  rawBody: string,
  signature: string,
  channelSecret: string,
): boolean => {
  if (signature === '' || channelSecret === '') return false;
  const given = Buffer.from(signature, 'base64');
  // Node's base64 decoder skips invalid characters; a signature that does not round-trip
  // is malformed rather than a different digest.
  if (given.toString('base64') !== signature) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
};

/**
 * Whether the event's reply token can be used. Redelivered events and events outside the
 * "active" channel mode carry no usable token. Assumption (ต้องยืนยันกับเอกสาร LINE): the token
 * is usable only when `mode` is exactly "active"; a missing or other mode ("standby") is not.
 */
export const usableReplyToken = (
  replyToken: string | undefined,
  mode: string | undefined,
  isRedelivery: boolean,
): string | null =>
  replyToken !== undefined && replyToken !== '' && mode === 'active' && !isRedelivery
    ? replyToken
    : null;

/**
 * Assumption (ต้องยืนยันกับเอกสาร LINE): `message.contentProvider.type` is "line" when LINE holds
 * the file. Anything else, including a missing provider, is not downloaded.
 */
const isHostedByLine = (contentProvider: { type: string } | undefined): boolean =>
  contentProvider?.type === 'line';

const nonEmpty = z.string().min(1);

const eventIdSchema = z.looseObject({ webhookEventId: nonEmpty });

const eventBaseSchema = z.looseObject({
  type: z.string(),
  timestamp: z.number().int().nonnegative(),
  source: z.looseObject({ type: z.literal('user'), userId: nonEmpty }),
  deliveryContext: z.looseObject({ isRedelivery: z.boolean() }).optional(),
  mode: z.string().optional(),
  replyToken: z.string().optional(),
});

const messageHeadSchema = z.looseObject({ id: nonEmpty, type: z.string() });
// quotedMessageId: present when the customer used LINE's reply on a message. A value that is not
// a non-empty string is ignored rather than dropping the message.
const textSchema = z.looseObject({ text: z.string(), quotedMessageId: z.unknown().optional() });
const mediaSchema = z.looseObject({
  contentProvider: z.looseObject({ type: z.string() }).optional(),
});
const stickerSchema = z.looseObject({ packageId: nonEmpty, stickerId: nonEmpty });
const postbackSchema = z.looseObject({ data: z.string().max(POSTBACK_DATA_MAX_CHARS) });
// duration (ms) is read tolerantly: a value that is not a non-negative integer counts as unknown.
const audioSchema = mediaSchema.extend({ duration: z.unknown().optional() });

const OTHER_KIND_BY_TYPE: Readonly<Record<string, OtherKind>> = {
  file: 'file',
  location: 'location',
};

const parseMessage = (raw: unknown): InboundLineMessage | null => {
  const head = messageHeadSchema.safeParse(raw);
  if (!head.success) return null;
  // Safe: LINE message ids are opaque strings and this is where the brand is applied.
  const lineMessageId = head.data.id as LineMessageId;
  switch (head.data.type) {
    case 'text': {
      const m = textSchema.safeParse(raw);
      if (!m.success) return null;
      const quoted = m.data.quotedMessageId;
      return {
        type: 'text',
        lineMessageId,
        text: m.data.text,
        // Safe: an opaque LINE message id, as above.
        quotedLineMessageId:
          typeof quoted === 'string' && quoted !== '' ? (quoted as LineMessageId) : null,
      };
    }
    case 'image':
    case 'video': {
      const m = mediaSchema.safeParse(raw);
      if (!m.success) return null;
      return {
        type: head.data.type,
        lineMessageId,
        hostedByLine: isHostedByLine(m.data.contentProvider),
      };
    }
    case 'audio': {
      const m = audioSchema.safeParse(raw);
      if (!m.success) return null;
      const d = m.data.duration;
      return {
        type: 'audio',
        lineMessageId,
        hostedByLine: isHostedByLine(m.data.contentProvider),
        durationMs: typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : null,
      };
    }
    case 'sticker': {
      const m = stickerSchema.safeParse(raw);
      return m.success
        ? {
            type: 'sticker',
            lineMessageId,
            packageId: m.data.packageId,
            stickerId: m.data.stickerId,
          }
        : null;
    }
    default:
      return {
        type: 'other',
        lineMessageId,
        otherKind: OTHER_KIND_BY_TYPE[head.data.type] ?? 'unknown',
      };
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const parseEvent = (raw: unknown, webhookEventId: WebhookEventId): LineEvent => {
  const obj = isRecord(raw) ? raw : {};
  const lineType = typeof obj.type === 'string' ? obj.type : 'unknown';
  const rawTs = obj.timestamp;
  // An unsupported event is only logged and marked as seen; epoch stands in for a missing time.
  const fallbackTime =
    typeof rawTs === 'number' && Number.isFinite(rawTs) ? new Date(rawTs) : new Date(0);
  const unsupported: LineEvent = {
    kind: 'unsupported',
    webhookEventId,
    timestamp: fallbackTime,
    isRedelivery: isRecord(obj.deliveryContext) && obj.deliveryContext.isRedelivery === true,
    lineType,
  };

  const parsed = eventBaseSchema.safeParse(raw);
  if (!parsed.success) return unsupported;
  const e = parsed.data;
  const isRedelivery = e.deliveryContext?.isRedelivery === true;
  const base = { webhookEventId, timestamp: new Date(e.timestamp), isRedelivery };
  // Safe: the LINE user id is an opaque string and this is where the brand is applied.
  const userId = e.source.userId as LineUserId;
  const replyToken = usableReplyToken(e.replyToken, e.mode, isRedelivery);

  switch (e.type) {
    case 'message': {
      const message = parseMessage(obj.message);
      return message === null
        ? unsupported
        : { ...base, kind: 'message', userId, replyToken, message };
    }
    case 'follow':
      return { ...base, kind: 'follow', userId, replyToken };
    case 'unfollow':
      return { ...base, kind: 'unfollow', userId };
    case 'postback': {
      // The data is untrusted text; the core decides whether it is one of the app's actions.
      const p = postbackSchema.safeParse(obj.postback);
      return p.success
        ? { ...base, kind: 'postback', userId, replyToken, data: p.data.data }
        : unsupported;
    }
    default:
      return unsupported;
  }
};

export interface ParsedLineWebhook {
  /** In payload order. */
  events: LineEvent[];
  /**
   * Events left out because they had no usable `webhookEventId`. An empty id would collide in
   * the dedupe table, so such an event is skipped instead of being returned as `unsupported`.
   */
  skippedWithoutEventId: number;
}

/** Never throws. Fails only when the body is not JSON or has no `events` array. */
export const parseLineWebhook = (
  rawBody: string,
): Result<ParsedLineWebhook, 'webhook.payload_invalid'> => {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return err('webhook.payload_invalid', 'body is not JSON');
  }
  if (!isRecord(json) || !Array.isArray(json.events)) {
    return err('webhook.payload_invalid', 'body has no events array');
  }
  const events: LineEvent[] = [];
  let skippedWithoutEventId = 0;
  for (const raw of json.events as unknown[]) {
    const id = eventIdSchema.safeParse(raw);
    if (!id.success) {
      skippedWithoutEventId += 1;
      continue;
    }
    // Safe: webhookEventId is an opaque LINE string and this is where the brand is applied.
    events.push(parseEvent(raw, id.data.webhookEventId as WebhookEventId));
  }
  return ok({ events, skippedWithoutEventId });
};
