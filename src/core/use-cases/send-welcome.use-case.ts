import type { ContactId, MessageId } from '@/core/domain';
import { buildWelcomeCard, ok } from '@/core/domain';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type SendWelcomeInput = { contactId: ContactId; replyToken: string };

export type SendWelcomeOutput =
  { outcome: 'sent'; messageId: MessageId } | { outcome: 'disabled' | 'failed' };

export type SendWelcomeDeps = Pick<
  AllPorts,
  'settings' | 'cipher' | 'messages' | 'gateway' | 'ids' | 'clock' | 'logger'
>;

/**
 * The welcome card on a follow event (specs/line-messaging.md "ข้อความต้อนรับ"): one reply with
 * the follow's reply token, never a push and never the model. A failure is logged and nothing
 * else happens. A sent card is kept as an outbound row with event code `welcome.sent`; it does
 * not change the chat list (no preview, order or unread change) and leaves the AI switch alone.
 */
export const makeSendWelcome: (
  deps: SendWelcomeDeps,
  config: UseCaseConfig,
) => UseCase<SendWelcomeInput, SendWelcomeOutput> = (deps, config) => {
  const { settings, messages, gateway, ids, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  return async ({ contactId, replyToken }) => {
    const s = await settings.get();
    if (!s.welcomeEnabled) {
      logger.log('info', 'line.welcome.skipped', { contactId, reason: 'welcome_disabled' });
      return ok({ outcome: 'disabled' });
    }
    const access = await loadLineAccess();
    if (!access.ok) {
      logger.log('warn', 'line.welcome.failed', { contactId, errorCode: access.error.code });
      return ok({ outcome: 'failed' });
    }
    const card = buildWelcomeCard({
      botName: s.lineBotName,
      welcomeText: s.welcomeText,
      particle: s.aiPoliteParticle,
      appBaseUrl: config.appBaseUrl,
    });
    const replied = await gateway.reply(access.value.channelAccessToken, replyToken, [
      { type: 'card', card },
    ]);
    if (!replied.ok) {
      logger.log('warn', 'line.welcome.failed', { contactId, errorCode: replied.error.code });
      return ok({ outcome: 'failed' });
    }
    const id = ids.messageId();
    const now = clock.now();
    await messages.insertOutboundIfAbsent({
      id,
      contactId,
      direction: 'outbound',
      author: 'ai',
      type: 'text',
      text: card.body,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: 'welcome.sent',
      lineMessageId: null,
      deliveryStatus: 'pending',
      deliveryError: null,
      retryKey: id,
      createdAt: now,
      sentAt: null,
    });
    await messages.markSent(id, now, replied.value.sentIds);
    logger.log('info', 'line.welcome.sent', { contactId, messageId: id });
    return ok({ outcome: 'sent', messageId: id });
  };
};
