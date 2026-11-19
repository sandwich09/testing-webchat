import type {
  ContactId,
  DocumentId,
  ErrorCode,
  MessageId,
  SendChannel,
  UsageId,
} from '@/core/domain';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  requestId?: string;
  contactId?: ContactId;
  messageId?: MessageId;
  documentId?: DocumentId;
  usageId?: UsageId;
  /** Route template such as "/api/contacts/:id/messages", not the real path. */
  route?: string;
  method?: string;
  httpStatus?: number;
  durationMs?: number;
  errorCode?: ErrorCode;
  /** Exception class name only. No message and no stack. */
  errorName?: string;
  lineEventType?: string;
  eventCount?: number;
  channel?: SendChannel;
  attempt?: number;
  /** Only values from an outcome union in the core. */
  outcome?: string;
  /** HandoffReason or a reason from AiReplyDecision. */
  reason?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costNanoUsd?: string;
  sizeBytes?: number;
  pageCount?: number;
  tokenCount?: number;
  count?: number;
}

export type LogEvent =
  // HTTP and after-response jobs
  | 'http.request.completed'
  | 'http.request.failed'
  | 'http.origin.rejected'
  | 'job.run.failed'
  // Access code
  | 'access.unlock.succeeded'
  | 'access.unlock.failed'
  | 'access.unlock.rate_limited'
  | 'access.unlock.client_ip_missing'
  // Webhook and LINE
  | 'line.webhook.received'
  | 'line.webhook.signature_invalid'
  | 'line.webhook.not_configured'
  | 'line.webhook.payload_invalid'
  | 'line.webhook.event_duplicate'
  | 'line.webhook.event_unsupported'
  | 'line.webhook.event_failed'
  | 'line.webhook.batch_unstored'
  | 'line.profile.fetch_failed'
  | 'line.send.succeeded'
  | 'line.send.failed'
  | 'line.send.reply_token_rejected'
  | 'line.send.stuck_recovered'
  | 'line.send.retry_expired'
  | 'line.loading.failed'
  | 'line.credentials.saved'
  | 'line.credentials.rejected'
  | 'line.credentials.unreadable'
  | 'line.connection.tested'
  // Rich menu and welcome card (fields: contactId, reason = the button, errorCode, outcome = the
  // step that failed; never postback data or texts)
  | 'line.postback.received'
  | 'line.postback.ignored'
  | 'line.postback.rate_limited'
  | 'line.rich_menu.action_handled'
  | 'line.rich_menu.published'
  | 'line.rich_menu.publish_failed'
  | 'line.rich_menu.removed'
  | 'line.rich_menu.remove_failed'
  | 'line.rich_menu.cleanup_failed'
  | 'line.welcome.sent'
  | 'line.welcome.skipped'
  | 'line.welcome.failed'
  // Media and uploads
  | 'media.store.succeeded'
  | 'media.store.failed'
  | 'media.store.not_ready'
  | 'media.store.stuck_recovered'
  | 'upload.ticket.issued'
  | 'upload.ticket.rejected'
  | 'upload.file.discarded'
  | 'upload.local_put.rejected'
  // AI
  | 'ai.reply.skipped'
  | 'ai.reply.superseded'
  | 'ai.reply.locked'
  | 'ai.reply.handoff'
  | 'ai.reply.sent'
  | 'ai.reply.cancelled'
  | 'ai.reply.failed'
  | 'ai.reply.stuck_recovered'
  | 'ai.model.called'
  | 'ai.price_unknown_model'
  // Topic guard (two-part names set by specs/topic-guard.md, an exception to the three-part rule).
  // Fields only from LogFields: never the customer text, the topics, the refusal or matchedTopic.
  | 'guard.checked'
  | 'guard.blocked'
  | 'guard.failed'
  // Knowledge base
  | 'knowledge.ingest.started'
  | 'knowledge.ingest.succeeded'
  | 'knowledge.ingest.failed'
  | 'knowledge.ingest.stuck_recovered'
  | 'knowledge.document.deleted'
  // Settings
  | 'settings.values.updated'
  // Admin notes (fields: contactId only, never the text)
  | 'contact.note.added'
  | 'contact.note.deleted'
  | 'contact.note.rate_limited';

export interface Logger {
  log(level: LogLevel, event: LogEvent, fields?: LogFields): void;
}
