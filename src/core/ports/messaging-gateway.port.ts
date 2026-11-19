import type {
  LineAccessToken,
  LineEvent,
  LineMessageId,
  LineUserId,
  OutboundLinePart,
  Result,
} from '@/core/domain';

export interface MessagingGateway {
  /** Sync: HMAC-SHA256 of rawBody with channelSecret (base64), compared to signature in constant time. */
  verifySignature(rawBody: string, signature: string, channelSecret: string): boolean;

  /** Sync: turns the webhook JSON into LineEvent. Strict only on the fields in use. */
  parseEvents(rawBody: string): Result<LineEvent[], 'webhook.payload_invalid'>;

  reply(
    token: LineAccessToken,
    replyToken: string,
    parts: OutboundLinePart[],
  ): Promise<
    Result<
      void,
      | 'line.reply_token_invalid'
      | 'line.unauthorized'
      | 'line.rate_limited'
      | 'line.reply_failed'
      | 'line.unavailable'
    >
  >;

  push(
    token: LineAccessToken,
    to: LineUserId,
    parts: OutboundLinePart[],
    retryKey: string,
  ): Promise<
    Result<
      { alreadyAccepted: boolean },
      | 'line.unauthorized'
      | 'line.quota_exceeded'
      | 'line.rate_limited'
      | 'line.push_failed'
      | 'line.unavailable'
    >
  >;

  getProfile(
    token: LineAccessToken,
    userId: LineUserId,
  ): Promise<
    Result<
      { displayName: string; pictureUrl: string | null },
      'line.profile_unavailable' | 'line.unauthorized' | 'line.unavailable'
    >
  >;

  /**
   * Only an HTTP 200 carries the file. Any other 2xx (LINE answers 202 while it still prepares a
   * video) is `line.content_not_ready`: nothing is read and the caller may ask again later.
   */
  downloadContent(
    token: LineAccessToken,
    lineMessageId: LineMessageId,
    variant: 'original' | 'preview',
    maxBytes: number,
  ): Promise<
    Result<
      {
        stream: ReadableStream<Uint8Array>;
        contentType: string | null;
        sizeBytes: number | null;
      },
      | 'line.content_unavailable'
      | 'line.content_not_ready'
      | 'media.too_large'
      | 'line.unauthorized'
      | 'line.unavailable'
    >
  >;

  /** Whether LINE has finished preparing the content of a message. One attempt, no retry. */
  getContentStatus(
    token: LineAccessToken,
    lineMessageId: LineMessageId,
  ): Promise<
    Result<
      'processing' | 'succeeded' | 'failed',
      'line.content_unavailable' | 'line.unauthorized' | 'line.unavailable'
    >
  >;

  showLoading(
    token: LineAccessToken,
    userId: LineUserId,
    seconds: number,
  ): Promise<Result<void, 'line.loading_failed' | 'line.unauthorized' | 'line.unavailable'>>;

  /**
   * Checks that the channel secret belongs to the Channel ID by asking LINE for a short-lived
   * token, which is revoked at once and never returned, stored or logged. A wrong pair is
   * `line.channel_secret_invalid`; 429, 5xx, a timeout or no network is `line.unavailable`
   * ("could not check").
   */
  verifyChannelSecret(
    channelId: string,
    channelSecret: string,
  ): Promise<Result<void, 'line.channel_secret_invalid' | 'line.unavailable'>>;

  /** Used to check an access token both when saving and when testing the connection. */
  getBotInfo(
    token: LineAccessToken,
  ): Promise<
    Result<{ botName: string; basicId: string }, 'line.credentials_invalid' | 'line.unavailable'>
  >;
}
