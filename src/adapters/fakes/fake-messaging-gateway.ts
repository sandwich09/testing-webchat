import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  LineAccessToken,
  LineEvent,
  LineMessageId,
  LineUserId,
  InboundLineMessage,
  OtherKind,
  OutboundLinePart,
  Result,
  RichMenuSpec,
  WebhookEventId,
} from '@/core/domain';
import { LINE_MAX_PARTS_PER_REQUEST, POSTBACK_DATA_MAX_CHARS, err, ok } from '@/core/domain';
import type { LineBotIdentity, MessagingGateway } from '@/core/ports';

export const FAKE_LINE_CHANNEL_SECRET = 'fake-channel-secret';
/** The Channel ID the fake pairs with FAKE_LINE_CHANNEL_SECRET. */
export const FAKE_LINE_CHANNEL_ID = '1000000001';
/** A valid access token of another channel: its bot is not the bot of FAKE_LINE_CHANNEL_ID. */
export const FAKE_LINE_OTHER_CHANNEL_TOKEN = 'fake-line-other-channel-token' as LineAccessToken; // brand: test token
const OTHER_CHANNEL_BOT = { botName: 'Other Bot', basicId: '@otherbot', botUserId: 'Uotherbot' };
export const FAKE_LINE_ACCESS_TOKEN = 'fake-access-token' as LineAccessToken;
/** A token the fake always rejects. */
export const FAKE_LINE_INVALID_TOKEN = 'fake-invalid-token' as LineAccessToken;

type Failure<M extends keyof MessagingGateway> = Extract<
  Awaited<ReturnType<MessagingGateway[M]>>,
  { ok: false }
>['error']['code'];

/** Methods whose next call can be made to fail with `failNext`. */
export type FakeMessagingGatewayFailable =
  | 'reply'
  | 'push'
  | 'getProfile'
  | 'downloadContent'
  | 'getContentStatus'
  | 'showLoading'
  | 'verifyChannelSecret'
  | 'getBotInfo'
  | 'createRichMenu'
  | 'uploadRichMenuImage'
  | 'setDefaultRichMenu'
  | 'clearDefaultRichMenu'
  | 'deleteRichMenu';

export interface FakeLineContent {
  original?: Uint8Array;
  /** Served for `variant: 'preview'`. */
  preview?: Uint8Array;
  contentType: string | null;
  /** When false the fake reports `sizeBytes: null`, like a response without Content-Length. */
  knownSize?: boolean;
  /**
   * "Not ready" answers before the content is ready, like LINE's 202 while a video is transcoded:
   * each download of the original (`line.content_not_ready`) and each `getContentStatus`
   * (`processing`) uses one. Once used up the status is `succeeded` and the original is served.
   */
  notReadyTimes?: number;
  /** `getContentStatus` says `failed` and the original is never served. */
  transcodingFailed?: boolean;
}

export interface FakeSentReply {
  token: LineAccessToken;
  replyToken: string;
  parts: OutboundLinePart[];
}

export interface FakeSentPush {
  token: LineAccessToken;
  to: LineUserId;
  parts: OutboundLinePart[];
  retryKey: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const parseMessage = (raw: unknown): InboundLineMessage | null => {
  if (!isObj(raw) || !nonEmptyString(raw.id) || typeof raw.type !== 'string') return null;
  const lineMessageId = raw.id as LineMessageId;
  switch (raw.type) {
    case 'text':
      return typeof raw.text === 'string'
        ? {
            type: 'text',
            lineMessageId,
            text: raw.text,
            quotedLineMessageId: nonEmptyString(raw.quotedMessageId)
              ? (raw.quotedMessageId as LineMessageId) // brand: opaque LINE id
              : null,
          }
        : null;
    case 'image':
    case 'video': {
      const provider = isObj(raw.contentProvider) ? raw.contentProvider.type : undefined;
      // Anything but an explicit "line" provider is not downloaded (conservative).
      return { type: raw.type, lineMessageId, hostedByLine: provider === 'line' };
    }
    case 'audio': {
      const provider = isObj(raw.contentProvider) ? raw.contentProvider.type : undefined;
      const d = raw.duration;
      return {
        type: 'audio',
        lineMessageId,
        hostedByLine: provider === 'line',
        durationMs: typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : null,
      };
    }
    case 'sticker':
      return nonEmptyString(raw.packageId) && nonEmptyString(raw.stickerId)
        ? { type: 'sticker', lineMessageId, packageId: raw.packageId, stickerId: raw.stickerId }
        : null;
    default: {
      const otherKind: OtherKind =
        raw.type === 'audio' || raw.type === 'file' || raw.type === 'location'
          ? raw.type
          : 'unknown';
      return { type: 'other', lineMessageId, otherKind };
    }
  }
};

const parseEvent = (obj: Obj, webhookEventId: WebhookEventId): LineEvent => {
  const lineType = typeof obj.type === 'string' ? obj.type : 'unknown';
  const timestampMs =
    typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp) ? obj.timestamp : null;
  const unsupported: LineEvent = {
    kind: 'unsupported',
    webhookEventId,
    timestamp: new Date(timestampMs ?? 0),
    isRedelivery: false,
    lineType,
  };
  if (timestampMs === null) return unsupported;
  const source = isObj(obj.source) ? obj.source : {};
  if (source.type !== 'user' || !nonEmptyString(source.userId)) return unsupported;
  const userId = source.userId as LineUserId;
  const isRedelivery = isObj(obj.deliveryContext) && obj.deliveryContext.isRedelivery === true;
  const base = { webhookEventId, timestamp: new Date(timestampMs), isRedelivery };
  // A redelivered or standby event never carries a usable reply token.
  const replyToken =
    nonEmptyString(obj.replyToken) && !isRedelivery && obj.mode !== 'standby'
      ? obj.replyToken
      : null;
  switch (lineType) {
    case 'message': {
      const message = parseMessage(obj.message);
      return message === null
        ? unsupported
        : { ...base, kind: 'message', userId, replyToken, message };
    }
    case 'follow':
      return { ...base, kind: 'follow', userId, replyToken };
    case 'unfollow':
      return { ...base, kind: 'unfollow', userId };
    case 'postback': {
      const postback = isObj(obj.postback) ? obj.postback : {};
      return typeof postback.data === 'string' && postback.data.length <= POSTBACK_DATA_MAX_CHARS
        ? { ...base, kind: 'postback', userId, replyToken, data: postback.data }
        : unsupported;
    }
    default:
      return unsupported;
  }
};

/** Same shape as the real LINE adapter's error: the stream errors with code media.too_large. */
export class FakeContentTooLargeError extends Error {
  readonly code = 'media.too_large';
  constructor(maxBytes: number) {
    super(`content exceeds ${String(maxBytes)} bytes`);
    this.name = 'FakeContentTooLargeError';
  }
}

const byteStream = (bytes: Uint8Array, maxBytes: number): ReadableStream<Uint8Array> => {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const chunk = bytes.slice(offset, offset + 1024);
      offset += chunk.length;
      if (offset > maxBytes) {
        controller.error(new FakeContentTooLargeError(maxBytes));
        return;
      }
      controller.enqueue(chunk);
    },
  });
};

/**
 * In-memory LINE. Tokens are accepted unless rejected, reply tokens work once, push retry keys
 * are remembered, and every call is recorded for the test to inspect.
 */
export class FakeMessagingGateway implements MessagingGateway {
  readonly channelSecret: string;
  readonly replies: FakeSentReply[] = [];
  readonly pushes: FakeSentPush[] = [];
  private sentCounter = 0;
  private richMenuCounter = 0;
  /** Rich menus that exist at the fake LINE, by id, and whether each has its picture. */
  readonly richMenus = new Map<string, { menu: RichMenuSpec; hasImage: boolean }>();
  /** The default rich menu of every user, or null. */
  defaultRichMenuId: string | null = null;
  readonly loadingCalls: { token: LineAccessToken; userId: LineUserId; seconds: number }[] = [];
  readonly rejectedTokens = new Set<string>([FAKE_LINE_INVALID_TOKEN]);
  readonly invalidReplyTokens = new Set<string>();
  quotaExceeded = false;
  /** Channel ID to its channel secret, for `verifyChannelSecret`. */
  readonly channels = new Map<string, string>();

  private readonly usedReplyTokens = new Set<string>();
  private readonly acceptedRetryKeys = new Set<string>();
  private readonly profiles = new Map<string, { displayName: string; pictureUrl: string | null }>();
  private readonly contents = new Map<string, FakeLineContent>();
  private readonly failures = new Map<string, string[]>();
  private botInfo = { botName: 'Fake Bot', basicId: '@fakebot', botUserId: 'Ufakebot' };
  /** When true, verifyChannelSecret checks the pair but cannot read the channel's bot. */
  channelBotUnreadable = false;

  constructor(opts: { channelSecret?: string } = {}) {
    this.channelSecret = opts.channelSecret ?? FAKE_LINE_CHANNEL_SECRET;
    this.channels.set(FAKE_LINE_CHANNEL_ID, this.channelSecret);
  }

  // --- test controls -------------------------------------------------------------------------

  /** The next call of `method` returns this error code (one entry per call, first in first out). */
  failNext<M extends FakeMessagingGatewayFailable>(method: M, code: Failure<M>): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), code]);
  }

  setProfile(
    userId: LineUserId,
    profile: { displayName: string; pictureUrl: string | null },
  ): void {
    this.profiles.set(userId, profile);
  }

  setContent(lineMessageId: LineMessageId, content: FakeLineContent): void {
    // A copy: the fake counts notReadyTimes down on its own record.
    this.contents.set(lineMessageId, { ...content });
  }

  setBotInfo(info: { botName: string; basicId: string; botUserId?: string }): void {
    this.botInfo = { ...info, botUserId: info.botUserId ?? this.botInfo.botUserId };
  }

  /** Signature LINE would send for this body. */
  sign(rawBody: string, secret: string = this.channelSecret): string {
    return createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  }

  // --- port ----------------------------------------------------------------------------------

  verifySignature(rawBody: string, signature: string, channelSecret: string): boolean {
    if (signature === '' || channelSecret === '') return false;
    const given = Buffer.from(signature, 'base64');
    // Base64 that does not round-trip is malformed.
    if (given.toString('base64') !== signature) return false;
    const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  parseEvents(rawBody: string): Result<LineEvent[], 'webhook.payload_invalid'> {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return err('webhook.payload_invalid');
    }
    if (!isObj(json) || !Array.isArray(json.events)) return err('webhook.payload_invalid');
    const events: LineEvent[] = [];
    for (const raw of json.events as unknown[]) {
      // An event without a usable id is left out, as the LINE adapter does: an empty id would
      // collide in WebhookEvent and could never be deduplicated.
      if (!isObj(raw) || !nonEmptyString(raw.webhookEventId)) continue;
      events.push(parseEvent(raw, raw.webhookEventId as WebhookEventId)); // brand: opaque LINE id
    }
    return ok(events);
  }

  createRichMenu(
    token: LineAccessToken,
    menu: RichMenuSpec,
  ): Promise<Result<{ richMenuId: string }, Failure<'createRichMenu'>>> {
    const failure = this.takeFailure('createRichMenu');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'createRichMenu'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    this.richMenuCounter += 1;
    const richMenuId = `richmenu-fake-${String(this.richMenuCounter)}`;
    this.richMenus.set(richMenuId, { menu: structuredClone(menu), hasImage: false });
    return Promise.resolve(ok({ richMenuId }));
  }

  uploadRichMenuImage(
    token: LineAccessToken,
    richMenuId: string,
  ): Promise<Result<void, Failure<'uploadRichMenuImage'>>> {
    const failure = this.takeFailure('uploadRichMenuImage');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'uploadRichMenuImage'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    const menu = this.richMenus.get(richMenuId);
    // LINE takes one picture per menu; a second upload is refused.
    if (menu === undefined || menu.hasImage) return Promise.resolve(err('line.rich_menu_failed'));
    menu.hasImage = true;
    return Promise.resolve(ok(undefined));
  }

  setDefaultRichMenu(
    token: LineAccessToken,
    richMenuId: string,
  ): Promise<Result<void, Failure<'setDefaultRichMenu'>>> {
    const failure = this.takeFailure('setDefaultRichMenu');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'setDefaultRichMenu'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    // LINE refuses a menu without its picture as the default.
    if (this.richMenus.get(richMenuId)?.hasImage !== true) {
      return Promise.resolve(err('line.rich_menu_failed'));
    }
    this.defaultRichMenuId = richMenuId;
    return Promise.resolve(ok(undefined));
  }

  clearDefaultRichMenu(
    token: LineAccessToken,
  ): Promise<Result<void, Failure<'clearDefaultRichMenu'>>> {
    const failure = this.takeFailure('clearDefaultRichMenu');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'clearDefaultRichMenu'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    this.defaultRichMenuId = null;
    return Promise.resolve(ok(undefined));
  }

  deleteRichMenu(
    token: LineAccessToken,
    richMenuId: string,
  ): Promise<Result<void, Failure<'deleteRichMenu'>>> {
    const failure = this.takeFailure('deleteRichMenu');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'deleteRichMenu'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    this.richMenus.delete(richMenuId);
    if (this.defaultRichMenuId === richMenuId) this.defaultRichMenuId = null;
    return Promise.resolve(ok(undefined));
  }

  /** LINE ids of sent messages, `fake-sent-1`, `fake-sent-2` and on, one per part. */
  private nextSentIds(count: number): LineMessageId[] {
    return Array.from({ length: count }, () => {
      this.sentCounter += 1;
      return `fake-sent-${String(this.sentCounter)}` as LineMessageId; // brand: fake LINE id
    });
  }

  reply(
    token: LineAccessToken,
    replyToken: string,
    parts: OutboundLinePart[],
  ): Promise<Result<{ sentIds: LineMessageId[] }, Failure<'reply'>>> {
    const failure = this.takeFailure('reply');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'reply'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    if (
      replyToken === '' ||
      this.usedReplyTokens.has(replyToken) ||
      this.invalidReplyTokens.has(replyToken)
    ) {
      return Promise.resolve(err('line.reply_token_invalid'));
    }
    if (parts.length === 0 || parts.length > LINE_MAX_PARTS_PER_REQUEST) {
      return Promise.resolve(err('line.reply_failed'));
    }
    this.usedReplyTokens.add(replyToken);
    this.replies.push({ token, replyToken, parts });
    return Promise.resolve(ok({ sentIds: this.nextSentIds(parts.length) }));
  }

  push(
    token: LineAccessToken,
    to: LineUserId,
    parts: OutboundLinePart[],
    retryKey: string,
  ): Promise<Result<{ alreadyAccepted: boolean; sentIds: LineMessageId[] }, Failure<'push'>>> {
    const failure = this.takeFailure('push');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'push'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    // A retry of an accepted request is answered as accepted and is not delivered twice.
    if (this.acceptedRetryKeys.has(retryKey)) {
      return Promise.resolve(ok({ alreadyAccepted: true, sentIds: [] }));
    }
    if (this.quotaExceeded) return Promise.resolve(err('line.quota_exceeded'));
    if (parts.length === 0 || parts.length > LINE_MAX_PARTS_PER_REQUEST) {
      return Promise.resolve(err('line.push_failed'));
    }
    this.acceptedRetryKeys.add(retryKey);
    this.pushes.push({ token, to, parts, retryKey });
    return Promise.resolve(ok({ alreadyAccepted: false, sentIds: this.nextSentIds(parts.length) }));
  }

  getProfile(
    token: LineAccessToken,
    userId: LineUserId,
  ): Promise<Result<{ displayName: string; pictureUrl: string | null }, Failure<'getProfile'>>> {
    const failure = this.takeFailure('getProfile');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'getProfile'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    const profile = this.profiles.get(userId);
    return Promise.resolve(
      profile === undefined ? err('line.profile_unavailable') : ok({ ...profile }),
    );
  }

  downloadContent(
    token: LineAccessToken,
    lineMessageId: LineMessageId,
    variant: 'original' | 'preview',
    maxBytes: number,
  ): Promise<
    Result<
      { stream: ReadableStream<Uint8Array>; contentType: string | null; sizeBytes: number | null },
      Failure<'downloadContent'>
    >
  > {
    const failure = this.takeFailure('downloadContent');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'downloadContent'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    const content = this.contents.get(lineMessageId);
    const bytes = variant === 'preview' ? content?.preview : content?.original;
    if (content === undefined || bytes === undefined)
      return Promise.resolve(err('line.content_unavailable'));
    if (
      variant === 'original' &&
      (content.transcodingFailed === true || this.takeNotReady(content))
    ) {
      return Promise.resolve(err('line.content_not_ready'));
    }
    const knownSize = content.knownSize ?? true;
    // With a known size an oversized file is refused before any byte is read.
    if (knownSize && bytes.length > maxBytes) return Promise.resolve(err('media.too_large'));
    return Promise.resolve(
      ok({
        stream: byteStream(bytes, maxBytes),
        contentType: content.contentType,
        sizeBytes: knownSize ? bytes.length : null,
      }),
    );
  }

  getContentStatus(
    token: LineAccessToken,
    lineMessageId: LineMessageId,
  ): Promise<Result<'processing' | 'succeeded' | 'failed', Failure<'getContentStatus'>>> {
    const failure = this.takeFailure('getContentStatus');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'getContentStatus'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    const content = this.contents.get(lineMessageId);
    if (content === undefined) return Promise.resolve(err('line.content_unavailable'));
    if (content.transcodingFailed === true) return Promise.resolve(ok('failed'));
    return Promise.resolve(ok(this.takeNotReady(content) ? 'processing' : 'succeeded'));
  }

  verifyChannelSecret(
    channelId: string,
    channelSecret: string,
  ): Promise<Result<{ bot: LineBotIdentity | null }, Failure<'verifyChannelSecret'>>> {
    const failure = this.takeFailure('verifyChannelSecret');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'verifyChannelSecret'>));
    const known = this.channels.get(channelId);
    if (known === undefined || known !== channelSecret) {
      return Promise.resolve(err('line.channel_secret_invalid'));
    }
    // Every channel of the fake is the bot of FAKE_LINE_ACCESS_TOKEN.
    const { botUserId, basicId } = this.botInfo;
    return Promise.resolve(ok({ bot: this.channelBotUnreadable ? null : { botUserId, basicId } }));
  }

  showLoading(
    token: LineAccessToken,
    userId: LineUserId,
    seconds: number,
  ): Promise<Result<void, Failure<'showLoading'>>> {
    const failure = this.takeFailure('showLoading');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'showLoading'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    // LINE accepts 5 to 60 seconds in steps of 5.
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60 || seconds % 5 !== 0) {
      return Promise.resolve(err('line.loading_failed'));
    }
    this.loadingCalls.push({ token, userId, seconds });
    return Promise.resolve(ok(undefined));
  }

  getBotInfo(
    token: LineAccessToken,
  ): Promise<
    Result<{ botName: string; basicId: string; botUserId: string }, Failure<'getBotInfo'>>
  > {
    const failure = this.takeFailure('getBotInfo');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'getBotInfo'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.credentials_invalid'));
    if (token === FAKE_LINE_OTHER_CHANNEL_TOKEN)
      return Promise.resolve(ok({ ...OTHER_CHANNEL_BOT }));
    return Promise.resolve(ok({ ...this.botInfo }));
  }

  /** Uses one "not ready" answer of the content; false once none are left. */
  private takeNotReady(content: FakeLineContent): boolean {
    if (content.notReadyTimes === undefined || content.notReadyTimes <= 0) return false;
    content.notReadyTimes -= 1;
    return true;
  }

  private isRejected(token: LineAccessToken): boolean {
    return token === '' || this.rejectedTokens.has(token);
  }

  private takeFailure(method: FakeMessagingGatewayFailable): string | null {
    const queue = this.failures.get(method);
    return queue?.shift() ?? null;
  }
}
