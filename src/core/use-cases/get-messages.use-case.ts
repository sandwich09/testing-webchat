import {
  MEDIA_STUCK_AFTER_MS,
  MESSAGE_PAGE_LIMIT,
  POLL_PAGE_LIMIT,
  SEND_STUCK_AFTER_MS,
  err,
  ok,
  quotedLineIdsOf,
  type ContactId,
  type Message,
  type Seq,
} from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type GetMessagesInput = {
  contactId: ContactId;
  mode:
    | { kind: 'latest' }
    | { kind: 'before'; beforeSeq: Seq }
    | { kind: 'changes'; afterUpdatedSeq: Seq };
};

export type GetMessagesOutput = {
  messages: Message[];
  /**
   * The messages that `messages` quote and that are known, read in one query for the whole page
   * (webchat-inbox "ข้อความที่ตอบกลับ"). Matched to each message with indexByLineId and quoteOf.
   */
  quoted: Message[];
  hasOlder: boolean | null;
  hasMore: boolean;
  highWater: Seq;
};

export type GetMessagesDeps = Pick<AllPorts, 'contacts' | 'messages' | 'clock' | 'logger'>;

export const makeGetMessages: (
  deps: GetMessagesDeps,
  config: UseCaseConfig,
) => UseCase<GetMessagesInput, GetMessagesOutput, 'contact.not_found'> =
  ({ contacts, messages, clock, logger }) =>
  async ({ contactId, mode }) => {
    if ((await contacts.findById(contactId)) === null) return err('contact.not_found');

    // Rows left behind by a stopped function: inbound media still pending and outbound messages
    // still sending become failed before the page is read, so this poll already shows them.
    const now = clock.now().getTime();
    const media = await messages.failStuckMedia(contactId, new Date(now - MEDIA_STUCK_AFTER_MS));
    if (media.length > 0) {
      logger.log('warn', 'media.store.stuck_recovered', { contactId, count: media.length });
    }
    const sends = await messages.failStuckDeliveries(
      contactId,
      new Date(now - SEND_STUCK_AFTER_MS),
    );
    if (sends.length > 0) {
      logger.log('warn', 'line.send.stuck_recovered', { contactId, count: sends.length });
    }

    const withQuotes = async (
      page: Omit<GetMessagesOutput, 'quoted'>,
    ): Promise<GetMessagesOutput> => ({
      ...page,
      quoted: await messages.findByLineIds(contactId, quotedLineIdsOf(page.messages)),
    });

    switch (mode.kind) {
      case 'latest': {
        // High-water mark first, so a row changed while listing is seen by the next poll.
        const highWater = await messages.maxUpdatedSeq(contactId);
        const page = await messages.listLatest(contactId, MESSAGE_PAGE_LIMIT);
        return ok(
          await withQuotes({
            messages: page.messages,
            hasOlder: page.hasOlder,
            hasMore: false,
            highWater,
          }),
        );
      }
      case 'before': {
        const page = await messages.listBefore(contactId, mode.beforeSeq, MESSAGE_PAGE_LIMIT);
        // The client does not move its cursor with this value.
        return ok(
          await withQuotes({
            messages: page.messages,
            hasOlder: page.hasOlder,
            hasMore: false,
            highWater: 0n as Seq, // brand: Seq zero, no cursor
          }),
        );
      }
      case 'changes': {
        const page = await messages.listChangedAfter(
          contactId,
          mode.afterUpdatedSeq,
          POLL_PAGE_LIMIT,
        );
        // Ascending updatedSeq: the last row is the highest; an empty page keeps the cursor.
        const highWater = page.messages.at(-1)?.updatedSeq ?? mode.afterUpdatedSeq;
        return ok(
          await withQuotes({
            messages: page.messages,
            hasOlder: null,
            hasMore: page.hasMore,
            highWater,
          }),
        );
      }
    }
  };
