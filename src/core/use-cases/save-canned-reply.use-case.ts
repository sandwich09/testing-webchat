import type { CannedReply, CannedReplyId } from '@/core/domain';
import { CANNED_REPLY_MAX_COUNT, err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type SaveCannedReplyInput =
  | { id: null; title: string; text: string }
  | { id: CannedReplyId; title?: string; text?: string; sortOrder?: number };

export type SaveCannedReplyOutput = CannedReply;

export type SaveCannedReplyDeps = Pick<AllPorts, 'cannedReplies' | 'ids' | 'clock' | 'logger'>;

/** Creates a canned reply at the end of the list, or edits one. */
export const makeSaveCannedReply: (
  deps: SaveCannedReplyDeps,
  config: UseCaseConfig,
) => UseCase<
  SaveCannedReplyInput,
  SaveCannedReplyOutput,
  'canned_reply.not_found' | 'canned_reply.limit_reached'
> =
  ({ cannedReplies, ids, clock, logger }) =>
  async (input, ctx) => {
    const now = clock.now();
    let saved: CannedReply;

    if (input.id === null) {
      if ((await cannedReplies.count()) >= CANNED_REPLY_MAX_COUNT) {
        return err('canned_reply.limit_reached');
      }
      saved = {
        id: ids.cannedReplyId(),
        title: input.title,
        text: input.text,
        sortOrder: (await cannedReplies.maxSortOrder()) + 1,
        createdAt: now,
        updatedAt: now,
      };
      await cannedReplies.create(saved);
    } else {
      const updated = await cannedReplies.update(input.id, {
        title: input.title,
        text: input.text,
        sortOrder: input.sortOrder,
        now,
      });
      if (updated === null) return err('canned_reply.not_found');
      saved = updated;
    }

    logger.log('info', 'canned_reply.item.saved', {
      requestId: ctx.requestId,
      cannedReplyId: saved.id,
    });
    return ok(saved);
  };
