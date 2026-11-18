import type { KbDocument } from '@/core/domain';
import { KNOWLEDGE_CAPACITY_TOKENS, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ListDocumentsInput = Record<string, never>;

export type ListDocumentsOutput = {
  documents: KbDocument[];
  usedTokens: number;
  capacityTokens: number;
};

export type ListDocumentsDeps = Pick<AllPorts, 'knowledge'>;

/** Rows without the extracted text; usedTokens counts ready rows only. */
export const makeListDocuments: (
  deps: ListDocumentsDeps,
  config: UseCaseConfig,
) => UseCase<ListDocumentsInput, ListDocumentsOutput> =
  ({ knowledge }) =>
  async () => {
    const [documents, usedTokens] = await Promise.all([
      knowledge.list(),
      knowledge.sumReadyTokens(),
    ]);
    return ok({ documents, usedTokens, capacityTokens: KNOWLEDGE_CAPACITY_TOKENS });
  };
