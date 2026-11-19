import type {
  Contact,
  ContactId,
  EventCode,
  InboundLineMessage,
  LineAccessToken,
  LineEvent,
  LineUserId,
  MediaFailure,
  MessageId,
  RichMenuAction,
} from '@/core/domain';
import {
  PROFILE_REFRESH_AFTER_MS,
  RICH_MENU_LABELS,
  err,
  ok,
  parsePostbackData,
  previewOf,
  replyTokenExpiry,
} from '@/core/domain';
import type { NewMessage } from '@/core/ports';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, RequestContext, UseCase, UseCaseConfig } from './types';

export type FollowUpJob =
  | { kind: 'store_media'; messageId: MessageId }
  | { kind: 'ai_reply'; contactId: ContactId; triggerMessageId: MessageId }
  /** A rich menu or welcome card tap, stored as `tapMessageId` (HandleRichMenuAction). */
  | {
      kind: 'rich_menu_action';
      contactId: ContactId;
      action: RichMenuAction;
      tapMessageId: MessageId;
    }
  /** A follow event with a reply token: the welcome card (SendWelcome), reply only. */
  | { kind: 'welcome'; contactId: ContactId; replyToken: string }
  /**
   * An event of a contact seen before: RefreshContactProfile, which fetches the profile only when
   * the last attempt is older than PROFILE_REFRESH_AFTER_MS. At most one per contact per request.
   */
  | { kind: 'refresh_profile'; contactId: ContactId };

export type ReceiveLineEventsInput = { rawBody: string; signature: string | null };

export type ReceiveLineEventsOutput = { followUps: FollowUpJob[] };

export type ReceiveLineEventsDeps = Pick<
  AllPorts,
  | 'settings'
  | 'cipher'
  | 'gateway'
  | 'webhookEvents'
  | 'contacts'
  | 'messages'
  | 'ids'
  | 'clock'
  | 'logger'
  | 'rateLimits'
  | 'hasher'
>;

type ContactEvent = Extract<LineEvent, { kind: 'message' | 'follow' | 'unfollow' | 'postback' }>;
type PostbackEvent = Extract<LineEvent, { kind: 'postback' }>;

const TAP_EVENT_CODES: Record<RichMenuAction, EventCode> = {
  ai_on: 'customer.tapped_ai_on',
  admin: 'customer.tapped_admin',
  how_to: 'customer.tapped_how_to',
};
type MessageEvent = Extract<LineEvent, { kind: 'message' }>;

const errorNameOf = (e: unknown): string => (e instanceof Error ? e.name : 'UnknownError');

/** What one webhook request kept: the jobs to run, and whether any event changed stored data. */
interface Batch {
  followUps: FollowUpJob[];
  stored: boolean;
}

/** Fields of a new inbound message that depend on the LINE message type. */
const typedFields = (
  m: InboundLineMessage,
): Pick<
  NewMessage,
  'type' | 'text' | 'mediaStatus' | 'stickerPackageId' | 'stickerId' | 'otherKind'
> & { mediaDurationMs: number | null; mediaFailure: MediaFailure | null } => {
  const none = {
    text: null,
    mediaStatus: null,
    mediaFailure: null,
    stickerPackageId: null,
    stickerId: null,
    mediaDurationMs: null,
  };
  switch (m.type) {
    case 'text':
      return { ...none, type: 'text', text: m.text, otherKind: null };
    case 'image':
    case 'video':
      // Media from an external URL is never fetched by the server (no user-supplied URLs).
      return {
        ...none,
        type: m.type,
        mediaStatus: m.hostedByLine ? 'pending' : 'failed',
        mediaFailure: m.hostedByLine ? null : 'external_source',
        otherKind: null,
      };
    case 'audio':
      // Same rule as images: audio hosted elsewhere is never fetched.
      return {
        ...none,
        type: 'audio',
        mediaStatus: m.hostedByLine ? 'pending' : 'failed',
        mediaFailure: m.hostedByLine ? null : 'external_source',
        mediaDurationMs: m.durationMs,
        otherKind: null,
      };
    case 'sticker':
      return {
        ...none,
        type: 'sticker',
        stickerPackageId: m.packageId,
        stickerId: m.stickerId,
        otherKind: null,
      };
    case 'other':
      return { ...none, type: 'other', otherKind: m.otherKind };
  }
};

export const makeReceiveLineEvents: (
  deps: ReceiveLineEventsDeps,
  config: UseCaseConfig,
) => UseCase<
  ReceiveLineEventsInput,
  ReceiveLineEventsOutput,
  | 'line.not_configured'
  | 'line.credentials_unreadable'
  | 'webhook.signature_invalid'
  | 'db.unavailable'
> = (deps, config) => {
  const { settings, gateway, webhookEvents, contacts, messages, ids, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);
  const hitRateLimit = makeHitRateLimit(deps, config);

  /**
   * Tells an outage from per-event failures once every event of a batch has failed. A repository
   * exception says nothing about its cause, so the database is asked directly.
   */
  const databaseAnswers = async (): Promise<boolean> => {
    try {
      await settings.ping();
      return true;
    } catch {
      return false;
    }
  };

  const newMessageOf = (event: MessageEvent, contactId: ContactId): NewMessage => ({
    id: ids.messageId(),
    contactId,
    direction: 'inbound',
    author: 'customer',
    ...typedFields(event.message),
    mediaUrl: null,
    previewUrl: null,
    eventCode: null,
    lineMessageId: event.message.lineMessageId,
    quotedLineMessageId: event.message.type === 'text' ? event.message.quotedLineMessageId : null,
    deliveryStatus: null,
    deliveryError: null,
    retryKey: null,
    createdAt: event.timestamp,
    sentAt: null,
  });

  const insertContactEvent = async (
    contactId: ContactId,
    eventCode: EventCode,
    at: Date,
  ): Promise<void> => {
    await messages.insertEvent({
      id: ids.messageId(),
      contactId,
      direction: 'internal',
      author: 'system',
      type: 'event',
      text: null,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode,
      lineMessageId: null,
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: at,
      sentAt: null,
    });
  };

  /**
   * A message or tap from a contact stored as `unfollowed` proves the customer is a friend again
   * (an unfollow, or a follow that never arrived, was lost or out of order): the status goes back
   * to following with the event's time and the same event line as a follow. setFollowStatus
   * compares event times, so a message older than the unfollow changes nothing.
   */
  const refollowOnActivity = async (contact: Contact, at: Date): Promise<void> => {
    if (contact.followStatus !== 'unfollowed') return;
    if (await contacts.setFollowStatus(contact.id, 'following', at)) {
      await insertContactEvent(contact.id, 'contact.followed', at);
    }
  };

  /**
   * First-seen contacts only, inside the request. The adapter applies LINE_PROFILE_TIMEOUT_MS and
   * does not retry; any failure leaves the contact without a name and processing continues. The
   * attempt is recorded (claimProfileRefresh) success or not, so the daily refresh of a later
   * event tries again only PROFILE_REFRESH_AFTER_MS later.
   */
  const fetchProfile = async (
    token: LineAccessToken,
    contactId: ContactId,
    lineUserId: LineUserId,
    ctx: RequestContext,
  ): Promise<void> => {
    try {
      const now = clock.now();
      const claimed = await contacts.claimProfileRefresh(
        contactId,
        now,
        new Date(now.getTime() - PROFILE_REFRESH_AFTER_MS),
      );
      if (!claimed) return;
      const profile = await gateway.getProfile(token, lineUserId);
      if (profile.ok) {
        await contacts.updateProfile(contactId, profile.value);
        return;
      }
      logger.log('warn', 'line.profile.fetch_failed', {
        requestId: ctx.requestId,
        contactId,
        errorCode: profile.error.code,
      });
    } catch (e) {
      logger.log('warn', 'line.profile.fetch_failed', {
        requestId: ctx.requestId,
        contactId,
        errorName: errorNameOf(e),
      });
    }
  };

  const ensureContact = async (
    event: ContactEvent,
    token: LineAccessToken,
    ctx: RequestContext,
    batch: Batch,
    withProfile: boolean,
  ): Promise<{ contact: Contact; created: boolean }> => {
    const ensured = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: event.userId,
      now: clock.now(),
    });
    if (!withProfile) return ensured;
    if (ensured.created) {
      await fetchProfile(token, ensured.contact.id, event.userId, ctx);
    } else if (
      !batch.followUps.some(
        (job) => job.kind === 'refresh_profile' && job.contactId === ensured.contact.id,
      )
    ) {
      // Decided after the response: the job claims and fetches only when the profile is stale,
      // so this never delays the webhook nor blocks storing the event.
      batch.followUps.push({ kind: 'refresh_profile', contactId: ensured.contact.id });
    }
    return ensured;
  };

  const handleMessage = async (
    event: MessageEvent,
    token: LineAccessToken,
    ctx: RequestContext,
    batch: Batch,
  ): Promise<void> => {
    const { followUps } = batch;
    const { contact } = await ensureContact(event, token, ctx, batch, true);
    const { inserted, message } = await messages.insertInboundIfAbsent(
      newMessageOf(event, contact.id),
    );
    batch.stored = true;
    // Media still pending gets its job on every delivery that finds the row, even a redelivery:
    // the first delivery may have failed before returning the job. StoreInboundMedia finishes a
    // message once, so a second job is harmless.
    if (
      (message.type === 'image' || message.type === 'video' || message.type === 'audio') &&
      message.mediaStatus === 'pending'
    ) {
      followUps.push({ kind: 'store_media', messageId: message.id });
    }
    // Same lineMessageId already stored (redelivery after a crash): no second unread or ai_reply.
    if (!inserted) return;
    await refollowOnActivity(contact, event.timestamp);

    const expiry = replyTokenExpiry(event.timestamp, event.isRedelivery);
    await contacts.recordInbound(contact.id, {
      at: event.timestamp,
      preview: previewOf(message),
      replyToken: expiry ? event.replyToken : null,
      replyTokenExpiresAt: expiry && event.replyToken !== null ? expiry : null,
    });
    // The kill switch and the message type are checked by GenerateAiReply after debouncing,
    // which also raises the non-text handoff. The switch is read again after the insert: a
    // "คุยกับ AI" tap job turns it on and then reads the latest message, so either this read
    // sees it on (this message gets its own job) or that job's read finds this message.
    const fresh = await contacts.findById(contact.id);
    if (fresh?.aiEnabled === true) {
      followUps.push({ kind: 'ai_reply', contactId: contact.id, triggerMessageId: message.id });
    }
  };

  /**
   * A tap on a button of the rich menu or the welcome card. The tap is kept as the inbound text
   * LINE shows in the chat (the button title, `displayText`) with the event code of the button,
   * so the inbox shows an event line and the AI history a marker. The reply is a job.
   */
  const handlePostback = async (
    event: PostbackEvent,
    token: LineAccessToken,
    ctx: RequestContext,
    batch: Batch,
  ): Promise<void> => {
    const action = parsePostbackData(event.data);
    if (action === null) {
      // Data this app did not make (another menu, an older version): ignored, never echoed.
      logger.log('info', 'line.postback.ignored', { requestId: ctx.requestId });
      return;
    }
    const { contact } = await ensureContact(event, token, ctx, batch, true);
    const limit = await hitRateLimit('rich_menu_tap', contact.id, clock.now());
    if (limit.limited) {
      logger.log('info', 'line.postback.rate_limited', {
        requestId: ctx.requestId,
        contactId: contact.id,
        reason: action,
      });
      return;
    }
    // Keyed on the webhook event: a redelivery that raced past webhookEvents.has stores nothing
    // and starts no second reply.
    const { inserted, message } = await messages.insertInboundIfAbsent({
      id: ids.messageId(),
      webhookEventId: event.webhookEventId,
      contactId: contact.id,
      direction: 'inbound',
      author: 'customer',
      type: 'text',
      text: RICH_MENU_LABELS[action].title,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: TAP_EVENT_CODES[action],
      lineMessageId: null,
      quotedLineMessageId: null,
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: event.timestamp,
      sentAt: null,
      mediaDurationMs: null,
    });
    batch.stored = true;
    if (!inserted) {
      logger.log('info', 'line.webhook.event_duplicate', {
        requestId: ctx.requestId,
        lineEventType: event.kind,
      });
      return;
    }
    await refollowOnActivity(contact, event.timestamp);
    const expiry = replyTokenExpiry(event.timestamp, event.isRedelivery);
    await contacts.recordInbound(contact.id, {
      at: event.timestamp,
      preview: previewOf(message),
      replyToken: expiry ? event.replyToken : null,
      replyTokenExpiresAt: expiry && event.replyToken !== null ? expiry : null,
    });
    logger.log('info', 'line.postback.received', {
      requestId: ctx.requestId,
      contactId: contact.id,
      reason: action,
    });
    batch.followUps.push({
      kind: 'rich_menu_action',
      contactId: contact.id,
      action,
      tapMessageId: message.id,
    });
  };

  const handleEvent = async (
    event: LineEvent,
    token: LineAccessToken,
    ctx: RequestContext,
    batch: Batch,
  ): Promise<void> => {
    switch (event.kind) {
      case 'unsupported':
        logger.log('info', 'line.webhook.event_unsupported', {
          requestId: ctx.requestId,
          lineEventType: event.lineType,
        });
        return;
      case 'follow': {
        const { contact, created } = await ensureContact(event, token, ctx, batch, true);
        if (
          (created || contact.followStatus === 'unfollowed') &&
          (await contacts.setFollowStatus(contact.id, 'following', event.timestamp))
        ) {
          batch.stored = true;
          await insertContactEvent(contact.id, 'contact.followed', event.timestamp);
        }
        // Every follow (a new friend or an unblock) gets the welcome card once; a redelivered
        // follow has no reply token, and the card is never pushed.
        if (event.replyToken !== null) {
          batch.followUps.push({
            kind: 'welcome',
            contactId: contact.id,
            replyToken: event.replyToken,
          });
        }
        return;
      }
      case 'unfollow': {
        // LINE serves no profile of a user who has just blocked the account.
        const { contact } = await ensureContact(event, token, ctx, batch, false);
        // setFollowStatus ignores an unfollow older than the latest follow or customer message.
        if (
          contact.followStatus === 'following' &&
          (await contacts.setFollowStatus(contact.id, 'unfollowed', event.timestamp))
        ) {
          batch.stored = true;
          await insertContactEvent(contact.id, 'contact.unfollowed', event.timestamp);
        }
        return;
      }
      case 'message':
        await handleMessage(event, token, ctx, batch);
        return;
      case 'postback':
        await handlePostback(event, token, ctx, batch);
        return;
    }
  };

  /** Every step is safe to repeat, so the WebhookEvent row is written last. */
  const processEvent = async (
    event: LineEvent,
    token: LineAccessToken,
    ctx: RequestContext,
    batch: Batch,
  ): Promise<void> => {
    if (await webhookEvents.has(event.webhookEventId)) {
      logger.log('info', 'line.webhook.event_duplicate', {
        requestId: ctx.requestId,
        lineEventType: event.kind,
      });
      return;
    }
    // Jobs go straight into followUps: once a message is stored its jobs must run even if a later
    // step of this event throws, because a redelivery finds the message and adds no job.
    await handleEvent(event, token, ctx, batch);
    await webhookEvents.insertIfAbsent({
      webhookEventId: event.webhookEventId,
      type: event.kind,
      receivedAt: clock.now(),
    });
  };

  return async (input, ctx) => {
    const access = await loadLineAccess();
    if (!access.ok) {
      logger.log('warn', 'line.webhook.not_configured', {
        requestId: ctx.requestId,
        errorCode: access.error.code,
      });
      return err(access.error.code);
    }

    // Nothing is read from or written for the body until the signature is verified.
    if (
      input.signature === null ||
      !gateway.verifySignature(input.rawBody, input.signature, access.value.channelSecret)
    ) {
      logger.log('warn', 'line.webhook.signature_invalid', {
        requestId: ctx.requestId,
        errorCode: 'webhook.signature_invalid',
      });
      return err('webhook.signature_invalid');
    }

    await settings.recordWebhookReceived(clock.now());

    const parsed = gateway.parseEvents(input.rawBody);
    if (!parsed.ok) {
      logger.log('warn', 'line.webhook.payload_invalid', {
        requestId: ctx.requestId,
        errorCode: parsed.error.code,
      });
      return ok({ followUps: [] });
    }
    logger.log('info', 'line.webhook.received', {
      requestId: ctx.requestId,
      eventCount: parsed.value.length,
    });

    const batch: Batch = { followUps: [], stored: false };
    const token = access.value.channelAccessToken;
    let completed = 0;
    for (const event of parsed.value) {
      try {
        await processEvent(event, token, ctx, batch);
        completed += 1;
      } catch (e) {
        logger.log('error', 'line.webhook.event_failed', {
          requestId: ctx.requestId,
          lineEventType: event.kind,
          errorName: errorNameOf(e),
        });
      }
    }
    if (
      completed === 0 &&
      parsed.value.length > 0 &&
      !batch.stored &&
      batch.followUps.length === 0 &&
      !(await databaseAnswers())
    ) {
      // Nothing of the batch was kept because the database is down: a 5xx makes LINE redeliver
      // it (with "Webhook redelivery" on), and deduplication stores each event once then.
      logger.log('error', 'line.webhook.batch_unstored', {
        requestId: ctx.requestId,
        eventCount: parsed.value.length,
        errorCode: 'db.unavailable',
      });
      return err('db.unavailable');
    }
    return ok({ followUps: batch.followUps });
  };
};
