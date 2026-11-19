import type { DocumentId, KbDocumentWithText } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type GetDocumentInput = { documentId: DocumentId };

export type GetDocumentOutput = KbDocumentWithText;

export type GetDocumentDeps = Pick<AllPorts, 'knowledge'>;

export const makeGetDocument: (
  deps: GetDocumentDeps,
  config: UseCaseConfig,
) => UseCase<GetDocumentInput, GetDocumentOutput, 'knowledge.not_found'> =
  ({ knowledge }) =>
  async ({ documentId }) => {
    const document = await knowledge.getWithText(documentId);
    return document === null ? err('knowledge.not_found') : ok(document);
  };
