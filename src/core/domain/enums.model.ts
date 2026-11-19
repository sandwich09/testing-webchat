// Values match data-model, api-contract, ui-screens and stubs-and-fixtures. Adding a value
// means editing all five in the same commit. Each enum is a const array so tests can check it.

export const FOLLOW_STATUSES = ['following', 'unfollowed'] as const;
export type FollowStatus = (typeof FOLLOW_STATUSES)[number];

export const AI_STATES = ['idle', 'replying'] as const;
export type AiState = (typeof AI_STATES)[number];

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound', 'internal'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_AUTHORS = ['customer', 'admin', 'ai', 'system'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'sticker',
  'other',
  'event',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const OTHER_KINDS = ['audio', 'file', 'location', 'unknown'] as const;
export type OtherKind = (typeof OTHER_KINDS)[number];

export const MEDIA_STATUSES = ['pending', 'ready', 'failed', 'too_large'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/**
 * Why inbound media is `failed`: a file whose content is not an accepted type, media LINE does
 * not host (never fetched), a download or store that did not work, or a job stopped midway.
 */
export const MEDIA_FAILURES = [
  'unsupported_type',
  'external_source',
  'download_failed',
  'interrupted',
] as const;
export type MediaFailure = (typeof MEDIA_FAILURES)[number];

export const DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** What is known about the stored LINE channel secret (admin-backoffice, LINE section). */
export const LINE_SECRET_STATUSES = ['verified', 'unchecked', 'no_channel_id'] as const;
export type LineSecretStatus = (typeof LINE_SECRET_STATUSES)[number];

export const DOCUMENT_STATUSES = ['processing', 'ready', 'failed'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const USAGE_KINDS = ['reply', 'ingest', 'guard'] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

/** blocked: the message was outside the topic guard, see specs/topic-guard.md. */
export const USAGE_OUTCOMES = [
  'ok',
  'handoff',
  'refused',
  'failed',
  'cancelled',
  'blocked',
] as const;
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

export const AI_PROVIDERS = ['claude'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_MODEL_IDS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type AiModelId = (typeof AI_MODEL_IDS)[number];

export const POLITE_PARTICLES = ['ค่ะ', 'ครับ'] as const;
export type PoliteParticle = (typeof POLITE_PARTICLES)[number];

/** Which "ข้อมูลที่ใช้ตอบ" block the prompt carries (ai-prompt section 2.2). */
export const AI_ANSWER_MODES = ['general', 'knowledge_only'] as const;
export type AiAnswerMode = (typeof AI_ANSWER_MODES)[number];

export const SEND_CHANNELS = ['reply', 'push'] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];

export const RATE_LIMIT_ACTIONS = [
  'unlock',
  'unlock_no_ip',
  'send_message',
  'upload_ticket',
  'pdf_ingest',
  'typing',
  'guard_test',
  'note_create',
  'rich_menu_tap',
] as const;
export type RateLimitAction = (typeof RATE_LIMIT_ACTIONS)[number];

/** Why the model asked for an admin, per ai-prompt.md section 5. */
export const MODEL_HANDOFF_REASONS = [
  'not_in_knowledge',
  'needs_human_action',
  'unsafe_or_offtopic',
  'other',
] as const;
export type ModelHandoffReason = (typeof MODEL_HANDOFF_REASONS)[number];

/** Why a contact is waiting for an admin. Stored in Contact.needsAdminReason; Thai text is in error-catalog. */
export const HANDOFF_REASONS = [
  'customer_sent_image',
  'customer_sent_video',
  'customer_sent_non_text', // sticker, audio, file, location or any other type
  'budget_reached',
  'ai_not_in_knowledge', // "ai_" + ModelHandoffReason
  'ai_needs_human_action',
  'ai_unsafe_or_offtopic',
  'ai_other',
  'ai_failed', // model call failed, refused, truncated, off-schema, or the reply could not be sent
  'ai_timeout', // aiState stuck longer than AI_STUCK_AFTER_MS
  'customer_asked_admin', // rich menu or welcome card button "คุยกับแอดมิน"
  'ai_unavailable', // "คุยกับ AI" pressed while the kill switch is off
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

/** Event lines in the chat (Message of type event). Thai text is in error-catalog. */
export const EVENT_CODES = [
  ...HANDOFF_REASONS.map((reason) => `handoff.${reason}` as const),
  'ai.turned_off_by_admin', // an admin message turned the contact's AI off
  'guard.blocked', // outside the topic guard: the AI sent the refusal text, no admin handoff
  'contact.followed',
  'contact.unfollowed',
  // Rich menu and welcome card buttons. Stored on the inbound row of the tap (type text, the
  // button title as text) and shown as an event line, see specs/line-messaging.md.
  'customer.tapped_ai_on',
  'customer.tapped_admin',
  'customer.tapped_how_to',
  // The outbound welcome card (type text, the card body as text), shown as a welcome bubble.
  'welcome.sent',
] as const;
export type EventCode = (typeof EVENT_CODES)[number];
