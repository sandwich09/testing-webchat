import type { ContactId } from '@/core/domain';
import { PROFILE_REFRESH_AFTER_MS, ok } from '@/core/domain';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type RefreshContactProfileInput = { contactId: ContactId };

/**
 * `skipped`: fetched (or tried) less than PROFILE_REFRESH_AFTER_MS ago, or another event claimed
 * it first. `failed`: LINE gave no profile (404 of a user who blocked the account included); the
 * stored name and picture stay, and the next try is PROFILE_REFRESH_AFTER_MS after this one.
 */
export type RefreshContactProfileOutput = { outcome: 'refreshed' | 'skipped' | 'failed' };

export type RefreshContactProfileDeps = Pick<
  AllPorts,
  'settings' | 'cipher' | 'gateway' | 'contacts' | 'clock' | 'logger'
>;

const errorNameOf = (e: unknown): string => (e instanceof Error ? e.name : 'UnknownError');

/**
 * The daily profile refresh of an existing contact (specs/line-messaging.md "โปรไฟล์ของผู้ใช้"),
 * a job after the webhook response. The attempt is claimed first with one compare-and-set, so
 * concurrent events of one contact make one LINE call. A success writes the name and the picture
 * (a picture LINE no longer has is cleared); a failure keeps both.
 */
export const makeRefreshContactProfile: (
  deps: RefreshContactProfileDeps,
  config: UseCaseConfig,
) => UseCase<RefreshContactProfileInput, RefreshContactProfileOutput> = (deps) => {
  const { gateway, contacts, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  return async ({ contactId }, ctx) => {
    const access = await loadLineAccess();
    if (!access.ok) return ok({ outcome: 'skipped' });
    const now = clock.now();
    const claimed = await contacts.claimProfileRefresh(
      contactId,
      now,
      new Date(now.getTime() - PROFILE_REFRESH_AFTER_MS),
    );
    if (!claimed) return ok({ outcome: 'skipped' });
    const contact = await contacts.findById(contactId);
    if (contact === null) return ok({ outcome: 'skipped' });
    try {
      const profile = await gateway.getProfile(access.value.channelAccessToken, contact.lineUserId);
      if (profile.ok) {
        await contacts.updateProfile(contactId, profile.value);
        logger.log('info', 'line.profile.refreshed', { requestId: ctx.requestId, contactId });
        return ok({ outcome: 'refreshed' });
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
    return ok({ outcome: 'failed' });
  };
};
