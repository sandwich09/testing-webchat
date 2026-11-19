import { describe, expect, it } from 'vitest';
import { ERROR_CODES, type AppError, type ErrorCode } from '@/core/domain';
import { errorResponseSchema } from '@/contracts';
import { describeError, ERROR_HTTP, WEBHOOK_STATUS_OVERRIDES } from './http-errors';

/**
 * Expected HTTP status of every code, copied by hand from docs/architecture/error-catalog.md
 * ("—" is null). A second, independent copy so a slip in ERROR_HTTP cannot hide.
 */
const CATALOG: Record<ErrorCode, number | null> = {
  'request.invalid': 400,
  'request.too_large': 413,
  'request.origin_forbidden': 403,
  'internal.unexpected': 500,
  'db.unavailable': 503,
  'storage.unavailable': 503,
  'secret.decrypt_failed': null,
  'access.unauthorized': 401,
  'access.code_invalid': 401,
  'access.rate_limited': 429,
  'webhook.signature_invalid': 401,
  'webhook.payload_invalid': null,
  'line.not_configured': 409,
  'line.credentials_unreadable': 409,
  'line.credentials_invalid': 422,
  'line.channel_secret_invalid': 422,
  'line.unauthorized': null,
  'line.quota_exceeded': null,
  'line.rate_limited': null,
  'line.push_failed': null,
  'line.reply_failed': null,
  'line.unavailable': 503,
  'line.reply_token_invalid': null,
  'line.profile_unavailable': null,
  'line.content_unavailable': null,
  'line.content_not_ready': null,
  'line.loading_failed': null,
  'line.send_interrupted': null,
  'contact.not_found': 404,
  'contact.unfollowed': 409,
  'message.not_found': 404,
  'message.not_retryable': 409,
  'message.retry_expired': 409,
  'message.id_conflict': 409,
  'message.rate_limited': 429,
  'upload.rate_limited': 429,
  'upload.type_not_allowed': 415,
  'upload.too_large': 413,
  'upload.not_found': 409,
  'upload.content_mismatch': 422,
  'upload.signature_invalid': 403,
  'upload.expired': 403,
  'media.too_large': 413,
  'media.not_found': 404,
  'ai.disabled_globally': 409,
  'ai.budget_exhausted': 409,
  'ai.refused': 502,
  'ai.truncated': 502,
  'ai.invalid_output': 502,
  'ai.unavailable': 503,
  'ai.rate_limited': 503,
  'ai.auth_failed': 502,
  'ai.bad_request': 502,
  'ai.no_response': 503,
  'ai.link_not_allowed': null,
  'settings.guard_topics_required': 409,
  'settings.guard_rate_limited': 429,
  'knowledge.rate_limited': 429,
  'knowledge.file_too_large': 413,
  'knowledge.not_pdf': 415,
  'knowledge.duplicate': 409,
  'knowledge.not_found': 404,
  'knowledge.not_retryable': 409,
  'knowledge.too_many_pages': null,
  'knowledge.capacity_exceeded': null,
  'knowledge.extract_failed': null,
  'knowledge.extract_empty': null,
  'knowledge.extract_refused': null,
  'knowledge.extract_interrupted': null,
  'canned_reply.not_found': 404,
  'canned_reply.limit_reached': 409,
};

describe('ERROR_HTTP', () => {
  it('has exactly the codes of ERROR_CODES', () => {
    expect(Object.keys(ERROR_HTTP).sort()).toEqual([...ERROR_CODES].sort());
    expect(Object.keys(CATALOG).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each([...ERROR_CODES])('maps %s to the status of the error catalog', (code) => {
    expect(ERROR_HTTP[code].status).toBe(CATALOG[code]);
  });

  it.each([...ERROR_CODES])('gives %s an English developer message', (code) => {
    const { message } = ERROR_HTTP[code];
    expect(message.length).toBeGreaterThan(0);
    // ASCII only: no Thai screen text, which belongs to src/common/error-messages.ts.
    expect(message).toMatch(/^[\x20-\x7E]+$/);
  });
});

describe('describeError', () => {
  it.each([...ERROR_CODES].filter((c) => CATALOG[c] !== null))(
    'answers %s with its status and the documented body',
    (code) => {
      const d = describeError({ code }, 'req-1');
      expect(d.status).toBe(CATALOG[code]);
      expect(d.mapped).toBe(true);
      expect(errorResponseSchema.parse(d.body)).toEqual({
        error: { code, message: ERROR_HTTP[code].message, requestId: 'req-1' },
      });
    },
  );

  it.each([...ERROR_CODES].filter((c) => CATALOG[c] === null))(
    'turns %s, which is never an HTTP answer, into 500 internal.unexpected',
    (code) => {
      const d = describeError({ code }, 'req-2');
      expect(d).toEqual({
        status: 500,
        mapped: false,
        body: {
          error: {
            code: 'internal.unexpected',
            message: ERROR_HTTP['internal.unexpected'].message,
            requestId: 'req-2',
          },
        },
      });
    },
  );

  it('never puts the detail of an AppError in the body', () => {
    const error: AppError = { code: 'line.unavailable', detail: 'token=abc' };
    const d = describeError(error, 'r');
    expect(JSON.stringify(d.body)).not.toContain('token=abc');
  });

  it('answers 401 for the two LINE setup codes on the webhook', () => {
    expect(
      describeError({ code: 'line.not_configured' }, 'r', WEBHOOK_STATUS_OVERRIDES).status,
    ).toBe(401);
    expect(
      describeError({ code: 'line.credentials_unreadable' }, 'r', WEBHOOK_STATUS_OVERRIDES).status,
    ).toBe(401);
    expect(
      describeError({ code: 'webhook.signature_invalid' }, 'r', WEBHOOK_STATUS_OVERRIDES).status,
    ).toBe(401);
    expect(describeError({ code: 'request.too_large' }, 'r', WEBHOOK_STATUS_OVERRIDES).status).toBe(
      413,
    );
  });

  it('answers 503 on the webhook when no event of the batch could be stored, so LINE redelivers', () => {
    const d = describeError({ code: 'db.unavailable' }, 'r', WEBHOOK_STATUS_OVERRIDES);
    expect(d.status).toBe(503);
    expect(d.body).toEqual({
      error: { code: 'db.unavailable', message: 'The database is unavailable', requestId: 'r' },
    });
  });
});
