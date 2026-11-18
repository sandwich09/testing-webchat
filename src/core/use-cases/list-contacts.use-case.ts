import { CONTACT_PAGE_LIMIT, POLL_PAGE_LIMIT, ok, type Contact, type Seq } from '@/core/domain';
import type { ContactFilter, ContactListCursor } from '@/core/ports';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ListContactsInput =
  | { mode: 'page'; filter: ContactFilter; search: string | null; before: ContactListCursor | null }
  | { mode: 'changes'; afterUpdatedSeq: Seq };

export type ListContactsOutput = {
  contacts: Contact[];
  next: ContactListCursor | null;
  hasMore: boolean;
  highWater: Seq;
  counts: { all: number; unread: number; needsAdmin: number };
  lineConfigured: boolean;
};

export type ListContactsDeps = Pick<
  AllPorts,
  'contacts' | 'messages' | 'settings' | 'ids' | 'clock' | 'logger'
>;

export const makeListContacts =
  (
    { contacts, messages, settings, ids, clock, logger }: ListContactsDeps,
    config: UseCaseConfig,
  ): UseCase<ListContactsInput, ListContactsOutput> =>
  async (input) => {
    // 1. Stuck AI recovery: the only write of this use case. The repository call is atomic, so
    // each stuck contact is returned to exactly one caller and gets exactly one event line.
    const recovered = await contacts.recoverStuckAiStates(
      new Date(clock.now().getTime() - config.aiStuckAfterMs),
    );
    for (const contactId of recovered) {
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
        eventCode: 'handoff.ai_timeout',
        lineMessageId: null,
        deliveryStatus: null,
        deliveryError: null,
        retryKey: null,
        createdAt: clock.now(),
        sentAt: null,
      });
    }
    if (recovered.length > 0) {
      logger.log('info', 'ai.reply.stuck_recovered', { count: recovered.length });
    }

    let page: Pick<ListContactsOutput, 'contacts' | 'next' | 'hasMore' | 'highWater'>;
    if (input.mode === 'page') {
      // Read the high-water mark before the list so rows changed in between show up in the
      // next polling round instead of being missed.
      const highWater = await contacts.maxUpdatedSeq();
      const { contacts: rows, next } = await contacts.list({
        filter: input.filter,
        search: input.search,
        before: input.before,
        limit: CONTACT_PAGE_LIMIT,
      });
      page = { contacts: rows, next, hasMore: next !== null, highWater };
    } else {
      const { contacts: rows, hasMore } = await contacts.listChangedAfter(
        input.afterUpdatedSeq,
        POLL_PAGE_LIMIT,
      );
      // Rows come back in updatedSeq order; an empty result keeps the caller's cursor.
      const highWater = rows.at(-1)?.updatedSeq ?? input.afterUpdatedSeq;
      page = { contacts: rows, next: null, hasMore, highWater };
    }

    const counts = await contacts.countByFilter();
    const { lineConfigured } = await settings.get();
    return ok({ ...page, counts, lineConfigured });
  };
