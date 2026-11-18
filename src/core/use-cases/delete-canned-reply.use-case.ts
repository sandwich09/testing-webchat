import type { CannedReplyId } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type DeleteCannedReplyInput = { id: CannedReplyId };

export type DeleteCannedReplyDeps = Pick<AllPorts, 'cannedReplies' | 'logger'>;

export const makeDeleteCannedReply: (
  deps: DeleteCannedReplyDeps,
  config: UseCaseConfig,
) => UseCase<DeleteCannedReplyInput, void, 'canned_reply.not_found'> =
  ({ cannedReplies, logger }) =>
  async ({ id }, ctx) => {
    if (!(await cannedReplies.delete(id))) return err('canned_reply.not_found');
    logger.log('info', 'canned_reply.item.deleted', {
      requestId: ctx.requestId,
      cannedReplyId: id,
    });
    return ok(undefined);
  };
