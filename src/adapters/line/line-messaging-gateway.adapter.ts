import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  LineAccessToken,
  LineEvent,
  LineMessageId,
  LineUserId,
  OutboundLinePart,
  Result,
} from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { MessagingGateway } from '@/core/ports';
import {
  LINE_CONTENT_TIMEOUT_MS,
  LINE_MAX_RETRIES,
  LINE_PROFILE_TIMEOUT_MS,
  LINE_REQUEST_TIMEOUT_MS,
} from './line.constants';
import type { FetchFn, LineExchange, LineOutcome, SleepFn } from './line-http';
import {
  defaultSleep,
  discard,
  exchange,
  isMonthlyQuotaError,
  readJson,
  retryAfterSeconds,
} from './line-http';
import { parseLineWebhook, verifyLineSignature } from './line-webhook.mapper';

export interface LineMessagingGatewayOptions {
  /** Messaging API base, `https://api.line.me` in production (`LINE_API_BASE_URL`). */
  apiBaseUrl: string;
  /** Content API base, `https://api-data.line.me` in production (`LINE_DATA_API_BASE_URL`). */
  dataApiBaseUrl: string;
  /** For tests; defaults to the global fetch. */
  fetch?: FetchFn;
  /** For tests; waits between retries. */
  sleep?: SleepFn;
}

/** The stream of `downloadContent` errors with this once more than `maxBytes` has arrived. */
export class LineContentTooLargeError extends Error {
  readonly code = 'media.too_large';
  constructor(maxBytes: number) {
    super(`LINE content exceeds ${String(maxBytes)} bytes`);
    this.name = 'LineContentTooLargeError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Value of `X-Line-Retry-Key`. Assumption (ต้องยืนยันกับเอกสาร LINE): LINE accepts only a UUID
 * there. Message ids (UUIDv7) are sent unchanged; any other key is mapped to a stable UUID
 * derived from its SHA-256, so the same key always yields the same header on every retry.
 */
export const toLineRetryKey = (retryKey: string): string => {
  if (UUID.test(retryKey)) return retryKey;
  const h = createHash('sha256').update(retryKey, 'utf8').digest().subarray(0, 16);
  h.writeUInt8((h.readUInt8(6) & 0x0f) | 0x80, 6); // version 8 (custom)
  h.writeUInt8((h.readUInt8(8) & 0x3f) | 0x80, 8); // RFC 9562 variant
  const hex = h.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Ids placed in a URL path: no dots, slashes or escapes, so the path cannot be redirected. */
const SAFE_PATH_ID = /^[A-Za-z0-9_-]{1,256}$/;

const profileSchema = z.looseObject({
  displayName: z.string(),
  pictureUrl: z.string().optional(),
});
const botInfoSchema = z.looseObject({ displayName: z.string().min(1), basicId: z.string().min(1) });

const toLineMessage = (part: OutboundLinePart): Record<string, string> => {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image':
    case 'video':
      return {
        type: part.type,
        originalContentUrl: part.originalUrl,
        previewImageUrl: part.previewUrl,
      };
  }
};

/**
 * Assumption (ต้องยืนยันกับเอกสาร LINE): LINE answers 400 to a reply whose token is invalid,
 * expired or used. Only the status is read, not the message (stubs-and-fixtures 4.1). A 400 means
 * nothing was sent, so the caller may push instead.
 */
const isReplyTokenRejection = (status: number): boolean => status === 400;

/**
 * Assumption (ต้องยืนยันกับเอกสาร LINE): a push whose retry key LINE already accepted is
 * answered 409 with header `x-line-accepted-request-id`.
 */
const isRetryKeyAlreadyAccepted = (status: number, headers: Headers): boolean =>
  status === 409 && headers.has('x-line-accepted-request-id');

/**
 * Content API path. Assumption (ต้องยืนยันกับเอกสาร LINE): the video preview image is served at
 * `/content/preview`. The id is checked against SAFE_PATH_ID before this is called.
 */
const contentPath = (lineMessageId: LineMessageId, variant: 'original' | 'preview'): string =>
  `/v2/bot/message/${lineMessageId}${variant === 'preview' ? '/content/preview' : '/content'}`;

const contentLength = (headers: Headers): number | null => {
  const value = headers.get('content-length');
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
};

const capStream = (body: ReadableStream<Uint8Array>, maxBytes: number) => {
  let total = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        // Erroring cancels the response body, so nothing past the cap is read on.
        if (total > maxBytes) controller.error(new LineContentTooLargeError(maxBytes));
        else controller.enqueue(chunk);
      },
    }),
  );
};

const outcomeDetail = (o: LineOutcome): string =>
  o.kind === 'error' ? `LINE answered ${String(o.status)}` : `LINE request ${o.kind}`;

const baseUrl = (value: string, name: string): URL => {
  const url = new URL(value.replace(/\/+$/, ''));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name} must be an http(s) URL`);
  }
  return url;
};

/** MessagingGateway over the LINE Messaging API with plain fetch (docs/specs/line-messaging.md). */
export const createLineMessagingGateway = (
  options: LineMessagingGatewayOptions,
): MessagingGateway => {
  const api = baseUrl(options.apiBaseUrl, 'apiBaseUrl');
  const data = baseUrl(options.dataApiBaseUrl, 'dataApiBaseUrl');
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;

  const urlOf = (base: URL, path: string): string =>
    `${base.origin}${base.pathname.replace(/\/+$/, '')}${path}`;

  const call = (
    base: URL,
    path: string,
    token: LineAccessToken,
    opts: { body?: unknown; headers?: Record<string, string>; timeoutMs: number; retries: number },
  ): Promise<LineExchange> =>
    exchange(fetchFn, sleep, {
      url: urlOf(base, path),
      init: {
        method: opts.body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...opts.headers,
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      },
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.retries,
    });

  return {
    verifySignature: verifyLineSignature,

    parseEvents(rawBody: string): Result<LineEvent[], 'webhook.payload_invalid'> {
      // The port cannot carry `skippedWithoutEventId`; events without an id are left out.
      const parsed = parseLineWebhook(rawBody);
      return parsed.ok ? ok(parsed.value.events) : parsed;
    },

    async reply(token, replyToken, parts) {
      const ex = await call(api, '/v2/bot/message/reply', token, {
        body: { replyToken, messages: parts.map(toLineMessage) },
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: LINE_MAX_RETRIES,
      });
      const o = ex.outcome;
      if (o.kind === 'ok') {
        await discard(o.response);
        return ok(undefined);
      }
      if (o.kind !== 'error') return err('line.unavailable', outcomeDetail(o));
      if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
      if (isReplyTokenRejection(o.status)) {
        // A rejected token after an attempt with no known result may mean that attempt was
        // delivered and used the token; pushing now could send the message twice.
        return ex.earlierAttemptUnknown
          ? err('line.unavailable', 'reply token rejected after an attempt with unknown result')
          : err('line.reply_token_invalid', outcomeDetail(o));
      }
      if (o.status === 429) return err('line.rate_limited', outcomeDetail(o), retryAfterSeconds(o));
      if (o.status >= 500) return err('line.unavailable', outcomeDetail(o));
      return err('line.reply_failed', outcomeDetail(o));
    },

    async push(token, to, parts, retryKey) {
      const ex = await call(api, '/v2/bot/message/push', token, {
        body: { to, messages: parts.map(toLineMessage) },
        headers: { 'x-line-retry-key': toLineRetryKey(retryKey) },
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: LINE_MAX_RETRIES,
      });
      const o = ex.outcome;
      if (o.kind === 'ok') {
        await discard(o.response);
        return ok({ alreadyAccepted: false });
      }
      if (o.kind !== 'error') return err('line.unavailable', outcomeDetail(o));
      if (isRetryKeyAlreadyAccepted(o.status, o.headers)) {
        return ok({ alreadyAccepted: true });
      }
      if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
      if (isMonthlyQuotaError(o.status, o.message)) {
        return err('line.quota_exceeded', outcomeDetail(o));
      }
      if (o.status === 429) return err('line.rate_limited', outcomeDetail(o), retryAfterSeconds(o));
      if (o.status >= 500) return err('line.unavailable', outcomeDetail(o));
      return err('line.push_failed', outcomeDetail(o));
    },

    async getProfile(token: LineAccessToken, userId: LineUserId) {
      if (!SAFE_PATH_ID.test(userId)) return err('line.profile_unavailable', 'invalid user id');
      // Called before the webhook is answered: short timeout and no retry.
      const ex = await call(api, `/v2/bot/profile/${userId}`, token, {
        timeoutMs: LINE_PROFILE_TIMEOUT_MS,
        retries: 0,
      });
      const o = ex.outcome;
      if (o.kind === 'timeout') return err('line.profile_unavailable', outcomeDetail(o));
      if (o.kind === 'network') return err('line.unavailable', outcomeDetail(o));
      if (o.kind === 'error') {
        if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
        if (o.status === 429 || o.status >= 500) return err('line.unavailable', outcomeDetail(o));
        return err('line.profile_unavailable', outcomeDetail(o));
      }
      const profile = profileSchema.safeParse(await readJson(o.response));
      if (!profile.success) return err('line.profile_unavailable', 'unexpected profile body');
      return ok({
        displayName: profile.data.displayName,
        pictureUrl: profile.data.pictureUrl ?? null,
      });
    },

    async downloadContent(
      token: LineAccessToken,
      lineMessageId: LineMessageId,
      variant: 'original' | 'preview',
      maxBytes: number,
    ) {
      if (!SAFE_PATH_ID.test(lineMessageId)) {
        return err('line.content_unavailable', 'invalid message id');
      }
      // Always the configured LINE data host; the id cannot change the path (SAFE_PATH_ID).
      const ex = await call(data, contentPath(lineMessageId, variant), token, {
        timeoutMs: LINE_CONTENT_TIMEOUT_MS,
        retries: LINE_MAX_RETRIES,
      });
      const o = ex.outcome;
      if (o.kind === 'timeout' || o.kind === 'network')
        return err('line.unavailable', outcomeDetail(o));
      if (o.kind === 'error') {
        if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
        if (o.status === 429 || o.status >= 500) return err('line.unavailable', outcomeDetail(o));
        return err('line.content_unavailable', outcomeDetail(o));
      }
      const sizeBytes = contentLength(o.response.headers);
      if (sizeBytes !== null && sizeBytes > maxBytes) {
        await discard(o.response);
        return err(
          'media.too_large',
          `Content-Length ${String(sizeBytes)} over ${String(maxBytes)}`,
        );
      }
      const body =
        o.response.body ??
        new ReadableStream<Uint8Array>({
          start: (c) => {
            c.close();
          },
        });
      return ok({
        stream: capStream(body, maxBytes),
        contentType: o.response.headers.get('content-type'),
        sizeBytes,
      });
    },

    async showLoading(token: LineAccessToken, userId: LineUserId, seconds: number) {
      // Not retried: the caller does not treat a failure here as a failure.
      const ex = await call(api, '/v2/bot/chat/loading/start', token, {
        body: { chatId: userId, loadingSeconds: seconds },
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: 0,
      });
      const o = ex.outcome;
      if (o.kind === 'ok') {
        await discard(o.response);
        return ok(undefined);
      }
      if (o.kind !== 'error' || o.status >= 500) return err('line.unavailable', outcomeDetail(o));
      if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
      return err('line.loading_failed', outcomeDetail(o));
    },

    async getBotInfo(token: LineAccessToken) {
      const ex = await call(api, '/v2/bot/info', token, {
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: LINE_MAX_RETRIES,
      });
      const o = ex.outcome;
      if (o.kind === 'error' && (o.status === 401 || o.status === 403)) {
        return err('line.credentials_invalid', outcomeDetail(o));
      }
      if (o.kind !== 'ok') return err('line.unavailable', outcomeDetail(o));
      const info = botInfoSchema.safeParse(await readJson(o.response));
      if (!info.success) return err('line.unavailable', 'unexpected bot info body');
      return ok({ botName: info.data.displayName, basicId: info.data.basicId });
    },
  };
};
