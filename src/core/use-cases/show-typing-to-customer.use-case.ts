import type { ContactId } from '@/core/domain';
import { LINE_LOADING_SECONDS, err, ok } from '@/core/domain';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ShowTypingToCustomerInput = { contactId: ContactId };

export type ShowTypingToCustomerOutput = { shown: boolean };

export type ShowTypingToCustomerDeps = Pick<
  AllPorts,
  'contacts' | 'settings' | 'cipher' | 'gateway' | 'rateLimits' | 'hasher' | 'clock' | 'logger'
>;

const notShown = () => ok({ shown: false });

export const makeShowTypingToCustomer: (
  deps: ShowTypingToCustomerDeps,
  config: UseCaseConfig,
) => UseCase<ShowTypingToCustomerInput, ShowTypingToCustomerOutput, 'contact.not_found'> = (
  deps,
  config,
) => {
  const { contacts, gateway, clock, logger } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);
  const loadLineAccess = makeLoadLineAccess(deps);

  // The loading indicator is best effort: every failure after the contact lookup is shown: false.
  return async ({ contactId }, ctx) => {
    const contact = await contacts.findById(contactId);
    if (contact === null) return err('contact.not_found');
    if (contact.followStatus === 'unfollowed') return notShown();

    // Per customer, not per IP: several admin tabs share one window.
    const limit = await hitRateLimit('typing', contactId, clock.now());
    if (limit.limited) return notShown();

    const access = await loadLineAccess();
    if (!access.ok) return notShown();

    const shown = await gateway.showLoading(
      access.value.channelAccessToken,
      contact.lineUserId,
      LINE_LOADING_SECONDS,
    );
    if (!shown.ok) {
      logger.log('warn', 'line.loading.failed', {
        requestId: ctx.requestId,
        contactId,
        errorCode: shown.error.code,
      });
      return notShown();
    }
    return ok({ shown: true });
  };
};
