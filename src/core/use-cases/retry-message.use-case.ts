import type { ContactId, Message, MessageId } from '@/core/domain';
import { err, isRetryKeyExpired, ok } from '@/core/domain';
import { makeDeliverOutbound } from './shared/deliver-outbound';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type RetryMessageInput = { contactId: ContactId; messageId: MessageId };

export type RetryMessageOutput = Message;

export type RetryMessageDeps = Pick<
  AllPorts,
  | 'messages'
  | 'contacts'
  | 'settings'
  | 'cipher'
  | 'gateway'
  | 'rateLimits'
  | 'hasher'
  | 'clock'
  | 'logger'
>;

export const makeRetryMessage: (
  deps: RetryMessageDeps,
  config: UseCaseConfig,
) => UseCase<
  RetryMessageInput,
  RetryMessageOutput,
  | 'message.rate_limited'
  | 'message.not_found'
  | 'message.not_retryable'
  | 'message.retry_expired'
  | 'contact.unfollowed'
  | 'line.not_configured'
  | 'line.credentials_unreadable'
> = (deps, config) => {
  const { messages, contacts, clock, logger } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);
  const loadLineAccess = makeLoadLineAccess(deps);
  const deliverOutbound = makeDeliverOutbound(deps);

  return async ({ contactId, messageId }, ctx) => {
    const limit = await hitRateLimit('send_message', ctx.clientIp ?? 'unknown', clock.now());
    if (limit.limited) return err('message.rate_limited', undefined, limit.retryAfterSeconds);

    const message = await messages.findById(messageId);
    if (message?.contactId !== contactId) return err('message.not_found');
    if (message.direction !== 'outbound' || message.deliveryStatus !== 'failed') {
      return err('message.not_retryable');
    }
    // LINE forgets the retry key LINE_RETRY_KEY_WINDOW_MS after the first push; a push with it
    // then is a new message and could reach the customer twice. The admin sends it anew instead.
    if (isRetryKeyExpired(message, clock.now())) {
      logger.log('warn', 'line.send.retry_expired', {
        requestId: ctx.requestId,
        messageId: message.id,
        contactId,
      });
      return err('message.retry_expired');
    }

    const contact = await contacts.findById(contactId);
    // The message row references its contact, so a missing contact means the message is gone too.
    if (contact === null) return err('message.not_found');
    if (contact.followStatus === 'unfollowed') return err('contact.unfollowed');

    const access = await loadLineAccess();
    if (!access.ok) return err(access.error.code);

    // Compare-and-set: of two concurrent retries only one moves failed to pending and sends.
    if (!(await messages.markPendingIfFailed(messageId, clock.now()))) {
      return err('message.not_retryable');
    }

    // Always push with the stored retry key: a reply has no retry key and the earlier attempt may
    // have reached the customer (ADR 0010).
    return ok(await deliverOutbound(message, contact, access.value, 'push_only'));
  };
};
