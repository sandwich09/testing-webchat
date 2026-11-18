// Values live in docs/architecture/project-setup.md section 10 (one place). Change them there first.
import type { AiModelId, PoliteParticle, RateLimitAction } from './enums.model';

const MB = 1024 * 1024;

// 10.1 Core
export const POLL_OVERLAP_SEQ = 20;
export const POLL_PAGE_LIMIT = 200;
export const AI_HISTORY_LIMIT = 20;
export const AI_REPLY_MAX_CHARS = 1000;
export const AI_MAX_ROUNDS_PER_RUN = 2;
export const AI_STUCK_AFTER_MS = 300_000;
export const AI_MAX_TOKENS = 16_000;
export const AI_EXTRACT_MAX_TOKENS = 64_000;
export const LINE_LOADING_SECONDS = 20;
export const KNOWLEDGE_CAPACITY_TOKENS = 50_000;
export const PDF_MAX_BYTES = 4 * MB;
export const PDF_MAX_PAGES = 30;
export const IMAGE_MAX_BYTES = 10 * MB;
export const VIDEO_MAX_BYTES = 50 * MB;
export const PREVIEW_MAX_BYTES = 1 * MB;
export const UPLOAD_TICKET_TTL_MS = 900_000;
export const LINE_TEXT_MAX_CHARS = 5000;
export const LINE_MAX_PARTS_PER_REQUEST = 5;
export const REPLY_TOKEN_USABLE_MS = 50_000;
export const ADMIN_TEXT_MAX_CHARS = 5000;
export const PREVIEW_TEXT_MAX_CHARS = 100;
export const MESSAGE_PAGE_LIMIT = 50;
export const CONTACT_PAGE_LIMIT = 50;
export const CONTACT_SEARCH_MAX_CHARS = 50;
export const CANNED_REPLY_MAX_COUNT = 100;
export const CANNED_TITLE_MAX_CHARS = 50;
export const CANNED_TEXT_MAX_CHARS = 2000;
export const AI_INSTRUCTIONS_MAX_CHARS = 2000;
export const AI_DAILY_BUDGET_MAX_USD = '10.00';
export const ACCESS_COOKIE_TTL_MS = 604_800_000;
export const WEBHOOK_MAX_BODY_BYTES = 1 * MB;
export const JSON_MAX_BODY_BYTES = 64 * 1024;
export const DEFAULT_AI_MODEL: AiModelId = 'claude-opus-5-5';
export const DEFAULT_AI_DAILY_BUDGET_USD = '2.00';
export const DEFAULT_POLITE_PARTICLE: PoliteParticle = 'ค่ะ';
// Topic guard (specs/topic-guard.md)
export const GUARD_MAX_TOPICS = 20;
export const GUARD_TOPIC_MAX_CHARS = 80;
export const GUARD_REFUSAL_MAX_CHARS = 300;
export const GUARD_TEST_MAX_CHARS = 1000;
export const GUARD_MODEL: AiModelId = 'claude-haiku-5-5';
export const GUARD_MAX_TOKENS = 2000;
export const GUARD_TIMEOUT_MS = 10_000;
export const GUARD_CONTEXT_TURNS = 4;
/** Also the column default of Settings.guardRefusalText in prisma/schema.prisma. */
export const DEFAULT_GUARD_REFUSAL_TEXT = 'คุยได้เฉพาะหัวข้อที่กำหนดไว้นะคะ';

// 10.2 Rate limits (fixed window)
export const RATE_LIMIT_UNLOCK = { limit: 5, windowMs: 60_000 } as const;
export const RATE_LIMIT_SEND_MESSAGE = { limit: 30, windowMs: 60_000 } as const;
export const RATE_LIMIT_UPLOAD_TICKET = { limit: 20, windowMs: 60_000 } as const;
export const RATE_LIMIT_PDF_INGEST = { limit: 5, windowMs: 3_600_000 } as const;
export const RATE_LIMIT_TYPING = { limit: 1, windowMs: 10_000 } as const;
export const RATE_LIMIT_GUARD_TEST = { limit: 10, windowMs: 60_000 } as const;

/** `scaled` rules are multiplied by RATE_LIMIT_SCALE. Only `unlock` is not scaled. */
export const RATE_LIMIT_RULES: Record<
  RateLimitAction,
  { limit: number; windowMs: number; scaled: boolean }
> = {
  unlock: { ...RATE_LIMIT_UNLOCK, scaled: false },
  send_message: { ...RATE_LIMIT_SEND_MESSAGE, scaled: true },
  upload_ticket: { ...RATE_LIMIT_UPLOAD_TICKET, scaled: true },
  pdf_ingest: { ...RATE_LIMIT_PDF_INGEST, scaled: true },
  typing: { ...RATE_LIMIT_TYPING, scaled: true },
  guard_test: { ...RATE_LIMIT_GUARD_TEST, scaled: true },
};
