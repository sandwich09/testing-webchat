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
      'line.content_unavailable' | 'media.too_large' | 'line.unauthorized' | 'line.unavailable'
    >
  >;

  showLoading(
    token: LineAccessToken,
    userId: LineUserId,
    seconds: number,
  ): Promise<Result<void, 'line.loading_failed' | 'line.unauthorized' | 'line.unavailable'>>;

  /** Used to check an access token both when saving and when testing the connection. */
  getBotInfo(
    token: LineAccessToken,
  ): Promise<
    Result<{ botName: string; basicId: string }, 'line.credentials_invalid' | 'line.unavailable'>
  >;
}
