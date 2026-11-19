import type { KbDocument } from '@/core/domain';
import { KNOWLEDGE_CAPACITY_TOKENS, KNOWLEDGE_STUCK_AFTER_MS, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ListDocumentsInput = Record<string, never>;

export type ListDocumentsOutput = {
  documents: KbDocument[];
  usedTokens: number;
  capacityTokens: number;
};

export type ListDocumentsDeps = Pick<AllPorts, 'knowledge' | 'clock' | 'logger'>;

/**
 * Rows without the extracted text; usedTokens counts ready rows only. First returns documents
 * stuck in `processing` for longer than KNOWLEDGE_STUCK_AFTER_MS to `failed` (the extraction's
 * function was stopped), so the list the settings page polls shows "ลองใหม่" instead.
 */
export const makeListDocuments: (
  deps: ListDocumentsDeps,
  config: UseCaseConfig,
) => UseCase<ListDocumentsInput, ListDocumentsOutput> =
  ({ knowledge, clock, logger }) =>
  async () => {
    const now = clock.now();
    const recovered = await knowledge.failStuckProcessing(
      new Date(now.getTime() - KNOWLEDGE_STUCK_AFTER_MS),
      now,
    );
    if (recovered.length > 0) {
      logger.log('warn', 'knowledge.ingest.stuck_recovered', { count: recovered.length });
    }
    const [documents, usedTokens] = await Promise.all([
      knowledge.list(),
      knowledge.sumReadyTokens(),
    ]);
    return ok({ documents, usedTokens, capacityTokens: KNOWLEDGE_CAPACITY_TOKENS });
  };
