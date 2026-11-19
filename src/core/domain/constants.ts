// Values live in docs/architecture/project-setup.md section 10 (one place). Change them there first.
import type { AiAnswerMode, AiModelId, PoliteParticle, RateLimitAction } from './enums.model';

const MB = 1024 * 1024;

// 10.1 Core
export const POLL_OVERLAP_SEQ = 20;
export const POLL_PAGE_LIMIT = 200;
export const AI_HISTORY_LIMIT = 20;
/** Characters of a quoted text shown to the model before a reply that quotes it. */
export const AI_QUOTE_SNIPPET_MAX_CHARS = 40;
export const AI_REPLY_MAX_CHARS = 1000;
export const AI_MAX_ROUNDS_PER_RUN = 2;
export const AI_STUCK_AFTER_MS = 300_000;
export const KNOWLEDGE_STUCK_AFTER_MS = 360_000;
export const MEDIA_STUCK_AFTER_MS = 360_000;
/**
 * Longest a StoreInboundMedia job may run, measured from its start. A step whose worst case would
 * end past it is not started, and a job still running when it passes is stopped and marked
 * `failed` (`interrupted`); timing-budget.spec.ts pins it under the webhook budget.
 */
export const MEDIA_JOB_BUDGET_MS = 255_000;
/** Reserve for one content download from LINE; not below the adapter's worst case. */
export const MEDIA_CONTENT_CALL_WORST_MS = 100_000;
/** Reserve for one transcoding status call to LINE; not below the adapter's worst case. */
export const MEDIA_STATUS_CALL_WORST_MS = 5000;
/** Wait before each transcoding status call while LINE prepares the content. */
export const MEDIA_NOT_READY_POLL_MS = 5000;
/**
 * FileStorage `put` of a file the adapter already holds in memory: the whole upload call, its own
 * retries included. Reading the source stream is not part of it (that is the download's time).
 */
export const STORAGE_PUT_TIMEOUT_MS = 60_000;
/** Any other remote FileStorage call: a whole `inspect` (metadata and leading bytes) or `delete`. */
export const STORAGE_CALL_TIMEOUT_MS = 10_000;
/** Reserve for storing and inspecting one inbound file: a `put` and an `inspect` at their timeouts. */
export const MEDIA_STORE_CALL_WORST_MS = STORAGE_PUT_TIMEOUT_MS + STORAGE_CALL_TIMEOUT_MS;
export const SEND_STUCK_AFTER_MS = 360_000;
export const AI_MAX_TOKENS = 16_000;
export const AI_EXTRACT_MAX_TOKENS = 64_000;
export const LINE_LOADING_SECONDS = 20;
export const KNOWLEDGE_CAPACITY_TOKENS = 50_000;
export const PDF_MAX_BYTES = 4 * MB;
export const PDF_MAX_PAGES = 30;
export const IMAGE_MAX_BYTES = 10 * MB;
export const VIDEO_MAX_BYTES = 50 * MB;
/**
 * `experimental.proxyClientMaxBodySize` of next.config.ts: the largest request body Next.js
 * buffers for proxy.ts before the route reads it. A longer body reaches the route silently cut
 * to this size, so it holds the largest local-disk upload (a video) with room to spare.
 */
export const PROXY_BODY_MAX_BYTES = VIDEO_MAX_BYTES + 8 * MB;
export const AUDIO_MAX_BYTES = 20 * MB;
export const PREVIEW_MAX_BYTES = 1 * MB;
export const UPLOAD_TICKET_TTL_MS = 900_000;
export const LINE_TEXT_MAX_CHARS = 5000;
export const LINE_MAX_PARTS_PER_REQUEST = 5;
export const REPLY_TOKEN_USABLE_MS = 50_000;
/** LINE keeps a push retry key this long; after it the same key is a new request. */
export const LINE_RETRY_KEY_WINDOW_MS = 86_400_000;
/** A LINE Channel ID is digits only, at most this many. */
export const LINE_CHANNEL_ID_MAX_CHARS = 20;
export const ADMIN_TEXT_MAX_CHARS = 5000;
export const PREVIEW_TEXT_MAX_CHARS = 100;
/**
 * The most UTF-16 code units a preview may hold. previewOf cuts at both limits, so a screen can
 * check a preview by its length alone, without the grapheme rules of its own browser.
 */
export const PREVIEW_TEXT_MAX_UNITS = PREVIEW_TEXT_MAX_CHARS * 8;
export const MESSAGE_PAGE_LIMIT = 50;
export const CONTACT_PAGE_LIMIT = 50;
export const CONTACT_SEARCH_MAX_CHARS = 50;
export const AI_INSTRUCTIONS_MAX_CHARS = 2000;
export const AI_NAME_MAX_CHARS = 40;
export const CONTACT_NOTE_MAX_CHARS = 1000;
/** Text of the rich menu button "วิธีทดสอบ"; well under LINE_TEXT_MAX_CHARS. */
export const HOW_TO_TEXT_MAX_CHARS = 1500;
/** Body of the welcome card, short enough for one Flex text block. */
export const WELCOME_TEXT_MAX_CHARS = 300;
/** LINE's limit on postback data; longer data is not a postback this app made. */
export const POSTBACK_DATA_MAX_CHARS = 300;
/** The compact rich menu picture (LINE's 2500 wide, 843 high size). */
export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 843;
/** Notes listed for one contact, newest first. */
export const CONTACT_NOTE_LIST_LIMIT = 100;
export const AI_DAILY_BUDGET_MAX_USD = '10.00';
export const ACCESS_COOKIE_TTL_MS = 604_800_000;
export const WEBHOOK_MAX_BODY_BYTES = 1 * MB;
export const JSON_MAX_BODY_BYTES = 64 * 1024;
export const DEFAULT_AI_MODEL: AiModelId = 'claude-sonnet-5-5';
export const DEFAULT_AI_DAILY_BUDGET_USD = '2.00';
export const DEFAULT_POLITE_PARTICLE: PoliteParticle = 'ค่ะ';
export const DEFAULT_AI_ANSWER_MODE: AiAnswerMode = 'general';
// LINE profile refresh (specs/line-messaging.md)
/** A contact's LINE profile is fetched again at most this often, counted from the last attempt. */
export const PROFILE_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
// Topic guard (specs/topic-guard.md)
export const GUARD_MAX_TOPICS = 20;
export const GUARD_TOPIC_MAX_CHARS = 80;
export const GUARD_TEST_MAX_CHARS = 1000;
export const GUARD_MODEL: AiModelId = 'claude-haiku-5-5';
export const GUARD_MAX_TOKENS = 2000;
export const GUARD_TIMEOUT_MS = 10_000;
export const GUARD_CONTEXT_TURNS = 4;
/** Topics the refusal names; more are summed up as "และเรื่องอื่น ๆ". */
export const GUARD_REFUSAL_MAX_TOPICS = 5;

// 10.2 Rate limits (fixed window)
export const RATE_LIMIT_UNLOCK = { limit: 5, windowMs: 60_000 } as const;
export const RATE_LIMIT_UNLOCK_NO_IP = { limit: 5, windowMs: 300_000 } as const;
export const RATE_LIMIT_SEND_MESSAGE = { limit: 30, windowMs: 60_000 } as const;
export const RATE_LIMIT_UPLOAD_TICKET = { limit: 20, windowMs: 60_000 } as const;
export const RATE_LIMIT_PDF_INGEST = { limit: 5, windowMs: 3_600_000 } as const;
export const RATE_LIMIT_TYPING = { limit: 1, windowMs: 10_000 } as const;
export const RATE_LIMIT_GUARD_TEST = { limit: 10, windowMs: 60_000 } as const;
export const RATE_LIMIT_NOTE_CREATE = { limit: 30, windowMs: 60_000 } as const;
/** Rich menu or welcome card taps of one contact (subject: the contact id). */
export const RATE_LIMIT_RICH_MENU_TAP = { limit: 3, windowMs: 10_000 } as const;

/** `scaled` rules are multiplied by RATE_LIMIT_SCALE. The two unlock rules are not scaled. */
export const RATE_LIMIT_RULES: Record<
  RateLimitAction,
  { limit: number; windowMs: number; scaled: boolean }
> = {
  unlock: { ...RATE_LIMIT_UNLOCK, scaled: false },
  unlock_no_ip: { ...RATE_LIMIT_UNLOCK_NO_IP, scaled: false },
  send_message: { ...RATE_LIMIT_SEND_MESSAGE, scaled: true },
  upload_ticket: { ...RATE_LIMIT_UPLOAD_TICKET, scaled: true },
  pdf_ingest: { ...RATE_LIMIT_PDF_INGEST, scaled: true },
  typing: { ...RATE_LIMIT_TYPING, scaled: true },
  guard_test: { ...RATE_LIMIT_GUARD_TEST, scaled: true },
  note_create: { ...RATE_LIMIT_NOTE_CREATE, scaled: true },
  rich_menu_tap: { ...RATE_LIMIT_RICH_MENU_TAP, scaled: true },
};
