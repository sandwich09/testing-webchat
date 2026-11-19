import type { OtherKind } from './enums.model';
import type { WelcomeCard } from './rich-menu.model';
import type { LineMessageId, LineUserId, WebhookEventId } from './ids';

/** A LINE webhook event after the LINE adapter has translated it. The core never sees LINE JSON. */
export type InboundLineMessage =
  | {
      type: 'text';
      lineMessageId: LineMessageId;
      text: string;
      /** The message the customer quoted with LINE's reply, when there is one. */
      quotedLineMessageId: LineMessageId | null;
    }
  | { type: 'image' | 'video'; lineMessageId: LineMessageId; hostedByLine: boolean }
  | {
      type: 'audio';
      lineMessageId: LineMessageId;
      hostedByLine: boolean;
      /** `message.duration` in milliseconds; null when LINE gave none. */
      durationMs: number | null;
    }
  | { type: 'sticker'; lineMessageId: LineMessageId; packageId: string; stickerId: string }
  | { type: 'other'; lineMessageId: LineMessageId; otherKind: OtherKind };

interface LineEventBase {
  webhookEventId: WebhookEventId;
  timestamp: Date;
  isRedelivery: boolean;
}

/** Events outside a one-to-one chat (group, room) become `unsupported`. */
export type LineEvent =
  | (LineEventBase & {
      kind: 'message';
      userId: LineUserId;
      replyToken: string | null;
      message: InboundLineMessage;
    })
  | (LineEventBase & { kind: 'follow'; userId: LineUserId; replyToken: string | null })
  | (LineEventBase & { kind: 'unfollow'; userId: LineUserId })
  /** A rich menu or card button. `data` is untrusted: only parsePostbackData gives it meaning. */
  | (LineEventBase & {
      kind: 'postback';
      userId: LineUserId;
      replyToken: string | null;
      data: string;
    })
  | (LineEventBase & { kind: 'unsupported'; lineType: string });

/** One outbound message for LINE. */
export type OutboundLinePart =
  | { type: 'text'; text: string }
  | { type: 'image'; originalUrl: string; previewUrl: string }
  | { type: 'video'; originalUrl: string; previewUrl: string }
  | { type: 'card'; card: WelcomeCard };
