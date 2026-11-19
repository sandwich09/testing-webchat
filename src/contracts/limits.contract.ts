// Limits the screens need, re-exported from the domain so they live in one place
// (docs/architecture/project-setup.md section 10).
export {
  ADMIN_TEXT_MAX_CHARS,
  AUDIO_MAX_BYTES,
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_NAME_MAX_CHARS,
  CONTACT_NOTE_LIST_LIMIT,
  CONTACT_NOTE_MAX_CHARS,
  CONTACT_PAGE_LIMIT,
  CONTACT_SEARCH_MAX_CHARS,
  GUARD_CONTEXT_TURNS,
  GUARD_MAX_TOKENS,
  GUARD_MAX_TOPICS,
  GUARD_MODEL,
  GUARD_TEST_MAX_CHARS,
  GUARD_TIMEOUT_MS,
  GUARD_TOPIC_MAX_CHARS,
  HOW_TO_TEXT_MAX_CHARS,
  IMAGE_MAX_BYTES,
  JSON_MAX_BODY_BYTES,
  KNOWLEDGE_CAPACITY_TOKENS,
  LINE_CHANNEL_ID_MAX_CHARS,
  LINE_RETRY_KEY_WINDOW_MS,
  MESSAGE_PAGE_LIMIT,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  POLL_OVERLAP_SEQ,
  POLL_PAGE_LIMIT,
  PREVIEW_MAX_BYTES,
  PREVIEW_TEXT_MAX_CHARS,
  UPLOAD_TICKET_TTL_MS,
  VIDEO_MAX_BYTES,
  WELCOME_TEXT_MAX_CHARS,
} from '@/core/domain';

// The topic list check shared by PATCH /api/settings and the settings form (domain-and-ports).
export { normalizeGuardTopics } from '@/core/domain';
export type { GuardTopicsIssue } from '@/core/domain';

// The fixed parts of the welcome card, for the read-only preview of the settings page.
export {
  RICH_MENU_ACTIONS,
  RICH_MENU_LABELS,
  WELCOME_NOTE,
  WELCOME_TITLE_LINE,
} from '@/core/domain';
