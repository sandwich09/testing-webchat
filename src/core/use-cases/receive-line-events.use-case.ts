import type {
  Contact,
  ContactId,
  EventCode,
  InboundLineMessage,
  LineAccessToken,
  LineEvent,
  LineUserId,
  MessageId,
} from '@/core/domain';
import { err, ok, previewOf, replyTokenExpiry } from '@/core/domain';
import type { NewMessage } from '@/core/ports';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, RequestContext, UseCase, UseCaseConfig } from './types';

export type FollowUpJob =
  | { kind: 'store_media'; messageId: MessageId }
  | { kind: 'ai_reply'; contactId: ContactId; triggerMessageId: MessageId };

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
>;

type ContactEvent = Extract<LineEvent, { kind: 'message' | 'follow' | 'unfollow' }>;
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
> => {
  const none = { text: null, mediaStatus: null, stickerPackageId: null, stickerId: null };
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
> = (deps) => {
  const { settings, gateway, webhookEvents, contacts, messages, ids, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

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
   * First-seen contacts only, inside the request. The adapter applies LINE_PROFILE_TIMEOUT_MS and
   * does not retry; any failure leaves the contact without a name and processing continues.
   */
  const fetchProfile = async (
    token: LineAccessToken,
    contactId: ContactId,
    lineUserId: LineUserId,
    ctx: RequestContext,
  ): Promise<void> => {
    try {
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
    withProfile: boolean,
  ): Promise<{ contact: Contact; created: boolean }> => {
    const ensured = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: event.userId,
      now: clock.now(),
    });
    if (ensured.created && withProfile) {
      await fetchProfile(token, ensured.contact.id, event.userId, ctx);
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
    const { contact } = await ensureContact(event, token, ctx, true);
    const { inserted, message } = await messages.insertInboundIfAbsent(
      newMessageOf(event, contact.id),
    );
    batch.stored = true;
    // Media still pending gets its job on every delivery that finds the row, even a redelivery:
    // the first delivery may have failed before returning the job. StoreInboundMedia finishes a
    // message once, so a second job is harmless.
    if (
      (message.type === 'image' || message.type === 'video') &&
      message.mediaStatus === 'pending'
    ) {
      followUps.push({ kind: 'store_media', messageId: message.id });
    }
    // Same lineMessageId already stored (redelivery after a crash): no second unread or ai_reply.
    if (!inserted) return;

    const expiry = replyTokenExpiry(event.timestamp, event.isRedelivery);
    await contacts.recordInbound(contact.id, {
      at: event.timestamp,
      preview: previewOf(message),
      replyToken: expiry ? event.replyToken : null,
      replyTokenExpiresAt: expiry && event.replyToken !== null ? expiry : null,
    });
    // The kill switch and the message type are checked by GenerateAiReply after debouncing,
    // which also raises the non-text handoff.
    if (contact.aiEnabled) {
      followUps.push({ kind: 'ai_reply', contactId: contact.id, triggerMessageId: message.id });
    }
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
        const { contact, created } = await ensureContact(event, token, ctx, true);
        if (created || contact.followStatus === 'unfollowed') {
          await contacts.setFollowStatus(contact.id, 'following', event.timestamp);
          batch.stored = true;
          await insertContactEvent(contact.id, 'contact.followed', event.timestamp);
        }
        return;
      }
      case 'unfollow': {
        // LINE serves no profile of a user who has just blocked the account.
        const { contact } = await ensureContact(event, token, ctx, false);
        if (contact.followStatus === 'following') {
          await contacts.setFollowStatus(contact.id, 'unfollowed', event.timestamp);
          batch.stored = true;
          await insertContactEvent(contact.id, 'contact.unfollowed', event.timestamp);
        }
        return;
      }
      case 'message':
        await handleMessage(event, token, ctx, batch);
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
