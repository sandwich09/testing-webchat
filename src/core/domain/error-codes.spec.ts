import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './error-codes';

// Written out by hand from docs/architecture/error-catalog.md (client.network is client-only).
const CATALOG = [
  'request.invalid',
  'request.too_large',
  'request.origin_forbidden',
  'internal.unexpected',
  'db.unavailable',
  'storage.unavailable',
  'secret.decrypt_failed',
  'access.unauthorized',
  'access.code_invalid',
  'access.rate_limited',
  'webhook.signature_invalid',
  'webhook.payload_invalid',
  'line.not_configured',
  'line.credentials_unreadable',
  'line.credentials_invalid',
  'line.channel_secret_invalid',
  'line.unauthorized',
  'line.quota_exceeded',
  'line.rate_limited',
  'line.push_failed',
  'line.reply_failed',
  'line.unavailable',
  'line.reply_token_invalid',
  'line.profile_unavailable',
  'line.content_unavailable',
  'line.content_not_ready',
  'line.loading_failed',
  'line.send_interrupted',
  'contact.not_found',
  'contact.unfollowed',
  'message.not_found',
  'message.not_retryable',
  'message.retry_expired',
  'message.id_conflict',
  'message.rate_limited',
  'upload.rate_limited',
  'upload.type_not_allowed',
  'upload.too_large',
  'upload.not_found',
  'upload.content_mismatch',
  'upload.signature_invalid',
  'upload.expired',
  'media.too_large',
  'media.not_found',
  'ai.disabled_globally',
  'ai.budget_exhausted',
  'ai.refused',
  'ai.truncated',
  'ai.invalid_output',
  'ai.unavailable',
  'ai.rate_limited',
  'ai.auth_failed',
  'ai.bad_request',
  'ai.no_response',
  'ai.link_not_allowed',
  'settings.guard_topics_required',
  'settings.guard_rate_limited',
  'knowledge.rate_limited',
  'knowledge.file_too_large',
  'knowledge.not_pdf',
  'knowledge.duplicate',
  'knowledge.not_found',
  'knowledge.not_retryable',
  'knowledge.too_many_pages',
  'knowledge.capacity_exceeded',
  'knowledge.extract_failed',
  'knowledge.extract_empty',
  'knowledge.extract_refused',
  'knowledge.extract_interrupted',
  'canned_reply.not_found',
  'canned_reply.limit_reached',
];

describe('ERROR_CODES', () => {
  it('has exactly the codes of the error catalog', () => {
    expect([...ERROR_CODES].sort()).toEqual([...CATALOG].sort());
  });

  it('has no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('does not include the client-only code', () => {
    expect(ERROR_CODES).not.toContain('client.network');
  });
});
