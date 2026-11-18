import type { Contact, ErrorCode, LineCredentials, Message, SendChannel } from '@/core/domain';
import { chooseSendChannel, toOutboundParts } from '@/core/domain';
import type { AllPorts } from '../types';

export type DeliverOutboundDeps = Pick<
  AllPorts,
  'contacts' | 'messages' | 'gateway' | 'settings' | 'clock' | 'logger'
>;

/** Always returns the row after the status update. The result is in deliveryStatus and deliveryError. */
export type DeliverOutbound = (
  message: Message,
  contact: Contact,
  access: LineCredentials,
  mode: 'auto' | 'push_only',
) => Promise<Message>;

/**
 * Sends one outbound message by the rules in docs/specs/line-messaging.md (ADR 0010): a usable
 * reply token first, push with the message's retry key otherwise. A reply that fails for any
 * reason but a rejected token is never followed by a push, since LINE may have delivered it.
 */
export const makeDeliverOutbound: (deps: DeliverOutboundDeps) => DeliverOutbound = ({
  contacts,
  messages,
  gateway,
  settings,
  clock,
  logger,
}) => {
  const succeeded = async (message: Message, channel: SendChannel): Promise<Message> => {
    const updated = await messages.markSent(message.id, clock.now());
    logger.log('info', 'line.send.succeeded', {
      channel,
      messageId: message.id,
      contactId: message.contactId,
    });
    return updated;
  };

  const failed = async (
    message: Message,
    channel: SendChannel,
    code: ErrorCode,
  ): Promise<Message> => {
    const updated = await messages.markFailed(message.id, code);
    await settings.recordLineError({ code, at: clock.now() });
    logger.log('error', 'line.send.failed', {
      channel,
      errorCode: code,
      messageId: message.id,
      contactId: message.contactId,
    });
    return updated;
  };

  return async (message, contact, access, mode) => {
    const parts = toOutboundParts(message);

    if (mode === 'auto') {
      const choice = chooseSendChannel(contact, clock.now());
      if (
        choice.channel === 'reply' &&
        (await contacts.consumeReplyToken(contact.id, choice.replyToken))
      ) {
        const replied = await gateway.reply(access.channelAccessToken, choice.replyToken, parts);
        if (replied.ok) return succeeded(message, 'reply');
        if (replied.error.code !== 'line.reply_token_invalid') {
          return failed(message, 'reply', replied.error.code);
        }
        logger.log('warn', 'line.send.reply_token_rejected', {
          messageId: message.id,
          contactId: message.contactId,
        });
      }
    }

    // Outbound rows always carry retryKey = id; the fallback keeps the key stable regardless.
    const retryKey = message.retryKey ?? message.id;
    const pushed = await gateway.push(
      access.channelAccessToken,
      contact.lineUserId,
      parts,
      retryKey,
    );
    if (pushed.ok) return succeeded(message, 'push');
    return failed(message, 'push', pushed.error.code);
  };
};
