import type { AppError, ErrorCode } from '@/core/domain';

/**
 * HTTP status and developer message of every error code, from docs/architecture/error-catalog.md.
 * `null` is the catalog's "—": the code never is an HTTP answer. The message is built from the
 * code only (never from `AppError.detail`) and carries no internal detail (api-contract).
 */
export const ERROR_HTTP = {
  // Request and system
  'request.invalid': { status: 400, message: 'The request does not match the schema' },
  'request.too_large': { status: 413, message: 'The request body is too large' },
  'request.origin_forbidden': { status: 403, message: 'The request origin is not allowed' },
  'internal.unexpected': { status: 500, message: 'An unexpected error occurred' },
  'db.unavailable': { status: 503, message: 'The database is unavailable' },
  'storage.unavailable': { status: 503, message: 'File storage is unavailable' },
  'secret.decrypt_failed': { status: null, message: 'A stored secret could not be decrypted' },
  // Access
  'access.unauthorized': { status: 401, message: 'A valid access cookie is required' },
  'access.code_invalid': { status: 401, message: 'The access code is not correct' },
  'access.rate_limited': { status: 429, message: 'Too many wrong access codes' },
  // Webhook and LINE
  'webhook.signature_invalid': { status: 401, message: 'The webhook signature is not valid' },
  'webhook.payload_invalid': { status: null, message: 'The webhook body is not valid' },
  'line.not_configured': { status: 409, message: 'LINE credentials are not set' },
  'line.credentials_unreadable': {
    status: 409,
    message: 'The stored LINE credentials cannot be read',
  },
  'line.credentials_invalid': { status: 422, message: 'LINE rejected the channel access token' },
  'line.channel_secret_invalid': {
    status: 422,
    message: 'LINE rejected the Channel ID and channel secret pair',
  },
  'line.unauthorized': { status: null, message: 'LINE rejected the channel access token' },
  'line.quota_exceeded': { status: null, message: 'The LINE message quota is used up' },
  'line.rate_limited': { status: null, message: 'LINE rate limited the request' },
  'line.push_failed': { status: null, message: 'LINE rejected the push request' },
  'line.reply_failed': { status: null, message: 'LINE rejected the reply request' },
  'line.unavailable': { status: 503, message: 'LINE is unavailable' },
  'line.reply_token_invalid': { status: null, message: 'LINE rejected the reply token' },
  'line.profile_unavailable': { status: null, message: 'The LINE profile is unavailable' },
  'line.content_unavailable': { status: null, message: 'The LINE content is unavailable' },
  'line.content_not_ready': {
    status: null,
    message: 'LINE has not finished preparing the content',
  },
  'line.loading_failed': { status: null, message: 'LINE rejected the loading request' },
  'line.send_interrupted': {
    status: null,
    message: 'The send stopped before its result was known',
  },
  // Contacts and messages
  'contact.not_found': { status: 404, message: 'The contact does not exist' },
  'contact.unfollowed': { status: 409, message: 'The contact has unfollowed the account' },
  'message.not_found': { status: 404, message: 'The message does not exist' },
  'message.not_retryable': { status: 409, message: 'The message is not in a failed state' },
  'message.retry_expired': {
    status: 409,
    message: 'The retry key window of the message has passed; send it as a new message',
  },
  'message.id_conflict': { status: 409, message: 'The message id is already used' },
  'message.rate_limited': { status: 429, message: 'Too many messages' },
  // Uploads and media
  'upload.rate_limited': { status: 429, message: 'Too many upload requests' },
  'upload.type_not_allowed': { status: 415, message: 'The file type is not allowed' },
  'upload.too_large': { status: 413, message: 'The file is too large' },
  'upload.not_found': { status: 409, message: 'The uploaded file is not complete' },
  'upload.content_mismatch': {
    status: 422,
    message: 'The file content does not match its declared type',
  },
  'upload.signature_invalid': { status: 403, message: 'The upload signature is not valid' },
  'upload.expired': { status: 403, message: 'The upload ticket has expired' },
  'media.too_large': { status: 413, message: 'The file is too large' },
  'media.not_found': { status: 404, message: 'The file does not exist' },
  // AI
  'ai.disabled_globally': { status: 409, message: 'AI is switched off for the whole system' },
  'ai.budget_exhausted': { status: 409, message: 'The daily AI budget is used up' },
  'ai.refused': { status: 502, message: 'The AI model refused the request' },
  'ai.truncated': { status: 502, message: 'The AI answer was truncated' },
  'ai.invalid_output': { status: 502, message: 'The AI answer did not match the schema' },
  'ai.unavailable': { status: 503, message: 'The AI provider is unavailable' },
  'ai.rate_limited': { status: 503, message: 'The AI provider rate limited the request' },
  'ai.auth_failed': { status: 502, message: 'The AI provider rejected the API key' },
  'ai.bad_request': { status: 502, message: 'The AI provider rejected the request' },
  'ai.no_response': { status: 503, message: 'The AI provider sent no answer in time' },
  'ai.link_not_allowed': { status: null, message: 'The AI reply held a link the shop never wrote' },
  // Settings
  'settings.guard_topics_required': {
    status: 409,
    message: 'At least one saved topic is required',
  },
  'settings.guard_rate_limited': { status: 429, message: 'Too many topic guard tests' },
  // Knowledge base
  'knowledge.rate_limited': { status: 429, message: 'Too many PDF uploads' },
  'knowledge.file_too_large': { status: 413, message: 'The PDF is too large' },
  'knowledge.not_pdf': { status: 415, message: 'The file is not a PDF' },
  'knowledge.duplicate': { status: 409, message: 'The file is already in the knowledge base' },
  'knowledge.not_found': { status: 404, message: 'The document does not exist' },
  'knowledge.not_retryable': { status: 409, message: 'The document is not in a failed state' },
  'knowledge.too_many_pages': { status: null, message: 'The PDF has too many pages' },
  'knowledge.capacity_exceeded': { status: null, message: 'The knowledge base would be full' },
  'knowledge.extract_failed': { status: null, message: 'The PDF could not be converted' },
  'knowledge.extract_empty': { status: null, message: 'The PDF has no readable text' },
  'knowledge.extract_refused': { status: null, message: 'The AI model refused the PDF' },
  'knowledge.extract_interrupted': {
    status: null,
    message: 'The PDF conversion stopped before it finished',
  },
  // Canned replies
  'canned_reply.not_found': { status: 404, message: 'The canned reply does not exist' },
  'canned_reply.limit_reached': { status: 409, message: 'The canned reply limit is reached' },
} as const satisfies Record<ErrorCode, { status: number | null; message: string }>;

type ErrorHttpTable = typeof ERROR_HTTP;

/** Codes that are an HTTP answer somewhere. Routes can only fail with these (checked by tsc). */
export type HttpErrorCode = {
  [K in ErrorCode]: ErrorHttpTable[K]['status'] extends number ? K : never;
}[ErrorCode];

/**
 * The catalog's "(webhook ตอบ 401)": on POST /api/line/webhook these codes answer 401, so LINE
 * does not treat a missing setup as a temporary server error. Applied by `access: 'webhook'`.
 */
export const WEBHOOK_STATUS_OVERRIDES: Partial<Record<HttpErrorCode, number>> = {
  'line.not_configured': 401,
  'line.credentials_unreadable': 401,
};

export interface ErrorBody {
  error: { code: ErrorCode; message: string; requestId: string };
}

/** The status and body of a failed request. A code without a status becomes a 500. */
export const describeError = (
  error: Pick<AppError, 'code'>,
  requestId: string,
  overrides: Partial<Record<ErrorCode, number>> = {},
): { status: number; body: ErrorBody; mapped: boolean } => {
  const entry: { status: number | null; message: string } = ERROR_HTTP[error.code];
  const status = overrides[error.code] ?? entry.status;
  if (status === null) {
    const fallback = ERROR_HTTP['internal.unexpected'];
    return {
      status: fallback.status,
      body: { error: { code: 'internal.unexpected', message: fallback.message, requestId } },
      mapped: false,
    };
  }
  return {
    status,
    body: { error: { code: error.code, message: entry.message, requestId } },
    mapped: true,
  };
};
