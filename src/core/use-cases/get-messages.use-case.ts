import {
  MESSAGE_PAGE_LIMIT,
  POLL_PAGE_LIMIT,
  err,
  ok,
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
  hasOlder: boolean | null;
  hasMore: boolean;
  highWater: Seq;
};

export type GetMessagesDeps = Pick<AllPorts, 'contacts' | 'messages'>;

export const makeGetMessages: (
  deps: GetMessagesDeps,
  config: UseCaseConfig,
) => UseCase<GetMessagesInput, GetMessagesOutput, 'contact.not_found'> =
  ({ contacts, messages }) =>
  async ({ contactId, mode }) => {
    if ((await contacts.findById(contactId)) === null) return err('contact.not_found');

    switch (mode.kind) {
      case 'latest': {
        // High-water mark first, so a row changed while listing is seen by the next poll.
        const highWater = await messages.maxUpdatedSeq(contactId);
        const page = await messages.listLatest(contactId, MESSAGE_PAGE_LIMIT);
        return ok({ messages: page.messages, hasOlder: page.hasOlder, hasMore: false, highWater });
      }
      case 'before': {
        const page = await messages.listBefore(contactId, mode.beforeSeq, MESSAGE_PAGE_LIMIT);
        // The client does not move its cursor with this value.
        return ok({
          messages: page.messages,
          hasOlder: page.hasOlder,
          hasMore: false,
          highWater: 0n as Seq, // brand: Seq zero, no cursor
        });
      }
      case 'changes': {
        const page = await messages.listChangedAfter(
          contactId,
          mode.afterUpdatedSeq,
          POLL_PAGE_LIMIT,
        );
        // Ascending updatedSeq: the last row is the highest; an empty page keeps the cursor.
        const highWater = page.messages.at(-1)?.updatedSeq ?? mode.afterUpdatedSeq;
        return ok({ messages: page.messages, hasOlder: null, hasMore: page.hasMore, highWater });
      }
    }
  };
