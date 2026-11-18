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
  WebhookEventId,
} from '@/core/domain';
import { LINE_MAX_PARTS_PER_REQUEST, err, ok } from '@/core/domain';
import type { MessagingGateway } from '@/core/ports';

export const FAKE_LINE_CHANNEL_SECRET = 'fake-channel-secret';
export const FAKE_LINE_ACCESS_TOKEN = 'fake-access-token' as LineAccessToken;
/** A token the fake always rejects. */
export const FAKE_LINE_INVALID_TOKEN = 'fake-invalid-token' as LineAccessToken;

type Failure<M extends keyof MessagingGateway> = Extract<
  Awaited<ReturnType<MessagingGateway[M]>>,
  { ok: false }
>['error']['code'];

/** Methods whose next call can be made to fail with `failNext`. */
export type FakeMessagingGatewayFailable =
  'reply' | 'push' | 'getProfile' | 'downloadContent' | 'showLoading' | 'getBotInfo';

export interface FakeLineContent {
  original?: Uint8Array;
  /** Served for `variant: 'preview'`. */
  preview?: Uint8Array;
  contentType: string | null;
  /** When false the fake reports `sizeBytes: null`, like a response without Content-Length. */
  knownSize?: boolean;
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
      return typeof raw.text === 'string' ? { type: 'text', lineMessageId, text: raw.text } : null;
    case 'image':
    case 'video': {
      const provider = isObj(raw.contentProvider) ? raw.contentProvider.type : undefined;
      // Anything but an explicit "line" provider is not downloaded (conservative).
      return { type: raw.type, lineMessageId, hostedByLine: provider === 'line' };
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
  readonly loadingCalls: { token: LineAccessToken; userId: LineUserId; seconds: number }[] = [];
  readonly rejectedTokens = new Set<string>([FAKE_LINE_INVALID_TOKEN]);
  readonly invalidReplyTokens = new Set<string>();
  quotaExceeded = false;

  private readonly usedReplyTokens = new Set<string>();
  private readonly acceptedRetryKeys = new Set<string>();
  private readonly profiles = new Map<string, { displayName: string; pictureUrl: string | null }>();
  private readonly contents = new Map<string, FakeLineContent>();
  private readonly failures = new Map<string, string[]>();
  private botInfo = { botName: 'Fake Bot', basicId: '@fakebot' };

  constructor(opts: { channelSecret?: string } = {}) {
    this.channelSecret = opts.channelSecret ?? FAKE_LINE_CHANNEL_SECRET;
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
    this.contents.set(lineMessageId, content);
  }

  setBotInfo(info: { botName: string; basicId: string }): void {
    this.botInfo = info;
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

  reply(
    token: LineAccessToken,
    replyToken: string,
    parts: OutboundLinePart[],
  ): Promise<Result<void, Failure<'reply'>>> {
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
    return Promise.resolve(ok(undefined));
  }

  push(
    token: LineAccessToken,
    to: LineUserId,
    parts: OutboundLinePart[],
    retryKey: string,
  ): Promise<Result<{ alreadyAccepted: boolean }, Failure<'push'>>> {
    const failure = this.takeFailure('push');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'push'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.unauthorized'));
    // A retry of an accepted request is answered as accepted and is not delivered twice.
    if (this.acceptedRetryKeys.has(retryKey)) return Promise.resolve(ok({ alreadyAccepted: true }));
    if (this.quotaExceeded) return Promise.resolve(err('line.quota_exceeded'));
    if (parts.length === 0 || parts.length > LINE_MAX_PARTS_PER_REQUEST) {
      return Promise.resolve(err('line.push_failed'));
    }
    this.acceptedRetryKeys.add(retryKey);
    this.pushes.push({ token, to, parts, retryKey });
    return Promise.resolve(ok({ alreadyAccepted: false }));
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
  ): Promise<Result<{ botName: string; basicId: string }, Failure<'getBotInfo'>>> {
    const failure = this.takeFailure('getBotInfo');
    if (failure !== null) return Promise.resolve(err(failure as Failure<'getBotInfo'>));
    if (this.isRejected(token)) return Promise.resolve(err('line.credentials_invalid'));
    return Promise.resolve(ok({ ...this.botInfo }));
  }

  private isRejected(token: LineAccessToken): boolean {
    return token === '' || this.rejectedTokens.has(token);
  }

  private takeFailure(method: FakeMessagingGatewayFailable): string | null {
    const queue = this.failures.get(method);
    return queue?.shift() ?? null;
  }
}
