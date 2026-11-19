import type {
  LineAccessToken,
  LineEvent,
  LineMessageId,
  LineUserId,
  OutboundLinePart,
  Result,
  RichMenuSpec,
} from '@/core/domain';

/** Errors of the rich menu calls (specs/line-messaging.md "Rich menu"). */
export type RichMenuError =
  'line.unauthorized' | 'line.rate_limited' | 'line.rich_menu_failed' | 'line.unavailable';

/** Which bot a token belongs to: LINE's `userId` and `basicId` of `GET /v2/bot/info`. */
export interface LineBotIdentity {
  botUserId: string;
  basicId: string;
}

export interface MessagingGateway {
  /** Creates a rich menu at LINE (POST /v2/bot/richmenu) and returns its id. */
  createRichMenu(
    token: LineAccessToken,
    menu: RichMenuSpec,
  ): Promise<Result<{ richMenuId: string }, RichMenuError>>;
  /** Uploads the app's rich menu picture (PNG, on the data host) to that menu. */
  uploadRichMenuImage(
    token: LineAccessToken,
    richMenuId: string,
  ): Promise<Result<void, RichMenuError>>;
  /** Makes the menu the default for every user. */
  setDefaultRichMenu(
    token: LineAccessToken,
    richMenuId: string,
  ): Promise<Result<void, RichMenuError>>;
  /** Removes the default menu of every user; no default is not an error. */
  clearDefaultRichMenu(token: LineAccessToken): Promise<Result<void, RichMenuError>>;
  /** Deletes a menu; a menu LINE does not know (404) counts as deleted. */
  deleteRichMenu(token: LineAccessToken, richMenuId: string): Promise<Result<void, RichMenuError>>;

  /** Sync: HMAC-SHA256 of rawBody with channelSecret (base64), compared to signature in constant time. */
  verifySignature(rawBody: string, signature: string, channelSecret: string): boolean;

  /** Sync: turns the webhook JSON into LineEvent. Strict only on the fields in use. */
  parseEvents(rawBody: string): Result<LineEvent[], 'webhook.payload_invalid'>;

  /** `sentIds`: LINE ids of the sent messages in part order, from `sentMessages`; may be empty. */
  reply(
    token: LineAccessToken,
    replyToken: string,
    parts: OutboundLinePart[],
  ): Promise<
    Result<
      { sentIds: LineMessageId[] },
      | 'line.reply_token_invalid'
      | 'line.unauthorized'
      | 'line.rate_limited'
      | 'line.reply_failed'
      | 'line.unavailable'
    >
  >;

  /** `sentIds` as for reply; empty when LINE had already accepted the retry key (409). */
  push(
    token: LineAccessToken,
    to: LineUserId,
    parts: OutboundLinePart[],
    retryKey: string,
  ): Promise<
    Result<
      { alreadyAccepted: boolean; sentIds: LineMessageId[] },
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
   * token, which is revoked at once and never returned, stored or logged. Before the revoke the
   * token reads the bot of that channel (`bot`), so a caller can check that an access token is
   * of the same channel; `bot` is null when LINE issued the token but the bot could not be read.
   * A wrong pair is `line.channel_secret_invalid`; 429, 5xx, a timeout or no network is
   * `line.unavailable` ("could not check").
   */
  verifyChannelSecret(
    channelId: string,
    channelSecret: string,
  ): Promise<
    Result<{ bot: LineBotIdentity | null }, 'line.channel_secret_invalid' | 'line.unavailable'>
  >;

  /** Used to check an access token both when saving and when testing the connection. */
  getBotInfo(
    token: LineAccessToken,
  ): Promise<
    Result<
      { botName: string; basicId: string; botUserId: string },
      'line.credentials_invalid' | 'line.unavailable'
    >
  >;
}
