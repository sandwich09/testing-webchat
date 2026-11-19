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
import type { MessagingGateway, RichMenuError } from '@/core/ports';
import {
  LINE_CONTENT_TIMEOUT_MS,
  LINE_LOADING_MAX_RETRIES,
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
import { toFlexWelcome, toLineRichMenu } from './line-flex.mapper';
import { parseLineWebhook, verifyLineSignature } from './line-webhook.mapper';
import { RICH_MENU_IMAGE_PNG_BASE64 } from './rich-menu-image.generated';

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

/**
 * Value of `X-Line-Retry-Key`: a UUID with version-5 and RFC 4122 variant bits over the first 16
 * bytes of SHA-256 of the key. LINE is known to accept version 4 and 5 keys; message ids are
 * UUIDv7, which LINE has not been seen to accept, so every key is mapped, ids included. The same
 * key always gives the same header, on every retry and after a restart.
 */
export const toLineRetryKey = (retryKey: string): string => {
  const h = createHash('sha256').update(retryKey, 'utf8').digest().subarray(0, 16);
  h.writeUInt8((h.readUInt8(6) & 0x0f) | 0x50, 6); // version 5
  h.writeUInt8((h.readUInt8(8) & 0x3f) | 0x80, 8); // RFC 4122 variant
  const hex = h.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Ids placed in a URL path: no dots, slashes or escapes, so the path cannot be redirected. */
const SAFE_PATH_ID = /^[A-Za-z0-9_-]{1,256}$/;

const profileSchema = z.looseObject({
  displayName: z.string(),
  pictureUrl: z.string().optional(),
});
const botInfoSchema = z.looseObject({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  basicId: z.string().min(1),
});
const contentStatusSchema = z.looseObject({
  status: z.enum(['processing', 'succeeded', 'failed']),
});
const richMenuCreatedSchema = z.looseObject({
  richMenuId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
});
const issuedTokenSchema = z.looseObject({ access_token: z.string().min(1) });
/** `sentMessages` of a reply or push answer: one entry per message, in request order. */
const sentListSchema = z.looseObject({ sentMessages: z.array(z.unknown()) });
const sentEntrySchema = z.looseObject({ id: z.string().min(1) });

/**
 * The LINE ids of the sent messages. Tolerant: a body without `sentMessages`, or entries without
 * a string id, give the ids that can be read and never fail the send, which already succeeded.
 * Assumption (ต้องยืนยันกับเอกสาร LINE): `sentMessages[].id` is the id a later `quotedMessageId`
 * names.
 */
export const sentIdsOf = (body: unknown): LineMessageId[] => {
  const list = sentListSchema.safeParse(body);
  if (!list.success) return [];
  const ids: LineMessageId[] = [];
  for (const entry of list.data.sentMessages) {
    const one = sentEntrySchema.safeParse(entry);
    if (one.success) ids.push(one.data.id as LineMessageId); // brand: a LINE message id
  }
  return ids;
};

const toLineMessage = (part: OutboundLinePart): object => {
  switch (part.type) {
    case 'card':
      return toFlexWelcome(part.card);
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
 * LINE answers 400 with a message matching "Invalid reply token" to a reply whose token is expired
 * or already used; nothing was sent, so the caller may push instead. Any other 400 (a malformed
 * message, with `details[].property`) is not about the token: pushing the same payload would fail
 * the same way, so it is `line.reply_failed`.
 */
const isReplyTokenRejection = (status: number, message: string | null): boolean =>
  status === 400 && message !== null && /invalid reply token/i.test(message);

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
const contentPath = (
  lineMessageId: LineMessageId,
  variant: 'original' | 'preview' | 'transcoding',
): string =>
  `/v2/bot/message/${lineMessageId}/content${variant === 'original' ? '' : `/${variant}`}`;

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

/** The rich menu picture, decoded once on first upload. */
let richMenuImage: Uint8Array | null = null;
const richMenuImageBytes = (): Uint8Array => {
  richMenuImage ??= new Uint8Array(Buffer.from(RICH_MENU_IMAGE_PNG_BASE64, 'base64'));
  return richMenuImage;
};

/** Error mapping shared by every rich menu call (specs/line-messaging.md "Rich menu"). */
const richMenuFailure = (o: LineOutcome) => {
  if (o.kind !== 'error' || o.status >= 500) return err('line.unavailable', outcomeDetail(o));
  if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
  if (o.status === 429) return err('line.rate_limited', outcomeDetail(o), retryAfterSeconds(o));
  return err('line.rich_menu_failed', outcomeDetail(o));
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
    opts: {
      body?: unknown;
      /** A body sent as is with its own content-type, such as a picture. */
      raw?: { bytes: Uint8Array; contentType: string };
      method?: 'POST' | 'DELETE';
      headers?: Record<string, string>;
      timeoutMs: number;
      retries: number;
    },
  ): Promise<LineExchange> => {
    const hasBody = opts.body !== undefined || opts.raw !== undefined;
    const contentType = opts.raw?.contentType ?? 'application/json';
    return exchange(fetchFn, sleep, {
      url: urlOf(base, path),
      init: {
        method: opts.method ?? (hasBody ? 'POST' : 'GET'),
        headers: {
          authorization: `Bearer ${token}`,
          ...(hasBody ? { 'content-type': contentType } : {}),
          ...opts.headers,
        },
        body:
          opts.raw !== undefined
            ? new Blob([opts.raw.bytes as Uint8Array<ArrayBuffer>])
            : hasBody
              ? JSON.stringify(opts.body)
              : undefined,
      },
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.retries,
    });
  };

  /** A rich menu call whose 2xx body is not needed. */
  const richMenuCall = async (
    base: URL,
    path: string,
    token: LineAccessToken,
    opts: Parameters<typeof call>[3],
    notFoundIsDone = false,
  ): Promise<Result<void, RichMenuError>> => {
    const o = (await call(base, path, token, opts)).outcome;
    if (o.kind === 'ok') {
      await discard(o.response);
      return ok(undefined);
    }
    if (notFoundIsDone && o.kind === 'error' && o.status === 404) return ok(undefined);
    return richMenuFailure(o);
  };

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
      if (o.kind === 'ok') return ok({ sentIds: sentIdsOf(await readJson(o.response)) });
      if (o.kind !== 'error') return err('line.unavailable', outcomeDetail(o));
      if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
      if (isReplyTokenRejection(o.status, o.message)) {
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
        return ok({ alreadyAccepted: false, sentIds: sentIdsOf(await readJson(o.response)) });
      }
      if (o.kind !== 'error') return err('line.unavailable', outcomeDetail(o));
      // An earlier attempt was accepted; its answer, and so the sent ids, is not known here.
      if (isRetryKeyAlreadyAccepted(o.status, o.headers)) {
        return ok({ alreadyAccepted: true, sentIds: [] });
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
      // Only 200 carries the file; 202 means LINE is still preparing it (a video being transcoded).
      if (o.response.status !== 200) {
        await discard(o.response);
        return err('line.content_not_ready', `LINE answered ${String(o.response.status)}`);
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

    async getContentStatus(token: LineAccessToken, lineMessageId: LineMessageId) {
      if (!SAFE_PATH_ID.test(lineMessageId)) {
        return err('line.content_unavailable', 'invalid message id');
      }
      // A poll: one short attempt; the caller decides whether to ask again.
      const ex = await call(data, contentPath(lineMessageId, 'transcoding'), token, {
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: 0,
      });
      const o = ex.outcome;
      if (o.kind !== 'ok' && o.kind !== 'error') return err('line.unavailable', outcomeDetail(o));
      if (o.kind === 'error') {
        if (o.status === 401) return err('line.unauthorized', outcomeDetail(o));
        if (o.status === 429 || o.status >= 500) return err('line.unavailable', outcomeDetail(o));
        return err('line.content_unavailable', outcomeDetail(o));
      }
      const body = contentStatusSchema.safeParse(await readJson(o.response));
      if (!body.success) return err('line.unavailable', 'unexpected transcoding body');
      return ok(body.data.status);
    },

    async verifyChannelSecret(channelId: string, channelSecret: string) {
      // Form fields, not JSON, and no bearer token: this is LINE's client-credentials endpoint.
      const issued = await exchange(fetchFn, sleep, {
        url: urlOf(api, '/v2/oauth/accessToken'),
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: channelId,
            client_secret: channelSecret,
          }).toString(),
        },
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        // Each attempt that reaches LINE issues a token; one attempt keeps it to one.
        maxRetries: 0,
      });
      const o = issued.outcome;
      if (o.kind === 'timeout' || o.kind === 'network') {
        return err('line.unavailable', outcomeDetail(o));
      }
      if (o.kind === 'error') {
        if (o.status === 429 || o.status >= 500) return err('line.unavailable', outcomeDetail(o));
        return err('line.channel_secret_invalid', outcomeDetail(o));
      }
      const token = issuedTokenSchema.safeParse(await readJson(o.response));
      // A 2xx without a token proves nothing either way.
      if (!token.success) return err('line.unavailable', 'unexpected token body');
      // The bot of this channel, read with the issued token before it is revoked: the access
      // token being saved must belong to the same bot. One attempt; no answer leaves it unknown.
      const issuedToken = token.data.access_token as LineAccessToken; // brand: LINE just issued it
      const info = await call(api, '/v2/bot/info', issuedToken, {
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: 0,
      });
      let bot: { botUserId: string; basicId: string } | null = null;
      if (info.outcome.kind === 'ok') {
        const parsed = botInfoSchema.safeParse(await readJson(info.outcome.response));
        if (parsed.success) bot = { botUserId: parsed.data.userId, basicId: parsed.data.basicId };
      }
      // Best effort: the token is short-lived and is dropped here whatever LINE answers.
      const revoked = await exchange(fetchFn, sleep, {
        url: urlOf(api, '/v2/oauth/revoke'),
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ access_token: token.data.access_token }).toString(),
        },
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      });
      if (revoked.outcome.kind === 'ok') await discard(revoked.outcome.response);
      return ok({ bot });
    },

    async showLoading(token: LineAccessToken, userId: LineUserId, seconds: number) {
      // Not retried: the caller does not treat a failure here as a failure.
      const ex = await call(api, '/v2/bot/chat/loading/start', token, {
        body: { chatId: userId, loadingSeconds: seconds },
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: LINE_LOADING_MAX_RETRIES,
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

    async createRichMenu(token, menu) {
      // One attempt: a retry after an unknown result could leave a second menu behind.
      const ex = await call(api, '/v2/bot/richmenu', token, {
        body: toLineRichMenu(menu),
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: 0,
      });
      const o = ex.outcome;
      if (o.kind !== 'ok') return richMenuFailure(o);
      const created = richMenuCreatedSchema.safeParse(await readJson(o.response));
      if (!created.success) return err('line.rich_menu_failed', 'unexpected rich menu body');
      return ok({ richMenuId: created.data.richMenuId });
    },

    async uploadRichMenuImage(token, richMenuId) {
      if (!SAFE_PATH_ID.test(richMenuId))
        return err('line.rich_menu_failed', 'invalid rich menu id');
      // Assumption (ต้องยืนยันกับเอกสาร LINE): a menu takes one picture only, so a retry after an
      // unknown result would be refused; one attempt, and the caller deletes the menu on failure.
      return richMenuCall(data, `/v2/bot/richmenu/${richMenuId}/content`, token, {
        raw: { bytes: richMenuImageBytes(), contentType: 'image/png' },
        timeoutMs: LINE_CONTENT_TIMEOUT_MS,
        retries: 0,
      });
    },

    async setDefaultRichMenu(token, richMenuId) {
      if (!SAFE_PATH_ID.test(richMenuId))
        return err('line.rich_menu_failed', 'invalid rich menu id');
      return richMenuCall(api, `/v2/bot/user/all/richmenu/${richMenuId}`, token, {
        method: 'POST',
        timeoutMs: LINE_REQUEST_TIMEOUT_MS,
        retries: LINE_MAX_RETRIES,
      });
    },

    async clearDefaultRichMenu(token) {
      // Assumption (ต้องยืนยันกับเอกสาร LINE): clearing when no default is set answers 2xx or 404.
      return richMenuCall(
        api,
        '/v2/bot/user/all/richmenu',
        token,
        { method: 'DELETE', timeoutMs: LINE_REQUEST_TIMEOUT_MS, retries: LINE_MAX_RETRIES },
        true,
      );
    },

    async deleteRichMenu(token, richMenuId) {
      if (!SAFE_PATH_ID.test(richMenuId))
        return err('line.rich_menu_failed', 'invalid rich menu id');
      return richMenuCall(
        api,
        `/v2/bot/richmenu/${richMenuId}`,
        token,
        { method: 'DELETE', timeoutMs: LINE_REQUEST_TIMEOUT_MS, retries: LINE_MAX_RETRIES },
        true,
      );
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
      return ok({
        botName: info.data.displayName,
        basicId: info.data.basicId,
        botUserId: info.data.userId,
      });
    },
  };
};
