import type { DocumentId } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type DeleteDocumentInput = { documentId: DocumentId };

export type DeleteDocumentDeps = Pick<AllPorts, 'knowledge' | 'logger'>;

/** The AiUsage rows of the extraction stay, so the cost totals remain right. */
export const makeDeleteDocument: (
  deps: DeleteDocumentDeps,
  config: UseCaseConfig,
) => UseCase<DeleteDocumentInput, void, 'knowledge.not_found'> =
  ({ knowledge, logger }) =>
  async ({ documentId }, ctx) => {
    if (!(await knowledge.delete(documentId))) return err('knowledge.not_found');
    logger.log('info', 'knowledge.document.deleted', { requestId: ctx.requestId, documentId });
    return ok(undefined);
  };
