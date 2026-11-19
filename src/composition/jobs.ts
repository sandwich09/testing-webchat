import type {
  ExtractDocument,
  ExtractFollowUp,
  FollowUpJob,
  RequestContext,
  UseCase,
  GenerateAiReplyInput,
  GenerateAiReplyOutput,
  StoreInboundMediaInput,
  StoreInboundMediaOutput,
} from '@/core/use-cases';
import type { RunJob } from './route';

export interface JobDeps {
  runJob: RunJob;
  storeInboundMedia: UseCase<StoreInboundMediaInput, StoreInboundMediaOutput>;
  generateAiReply: UseCase<GenerateAiReplyInput, GenerateAiReplyOutput>;
  extractDocument: ExtractDocument;
}

/** The after-response work routes hand over, each through `runJob`. */
export const makeJobs = (deps: () => JobDeps) => ({
  /**
   * POST /api/line/webhook: every follow-up of ReceiveLineEvents runs after the 200, each in
   * its own job: `store_media` → StoreInboundMedia, `ai_reply` → GenerateAiReply.
   */
  scheduleLineFollowUps: (
    followUps: readonly FollowUpJob[],
    ctx: RequestContext,
    route = '/api/line/webhook',
  ): void => {
    const d = deps();
    for (const followUp of followUps) {
      switch (followUp.kind) {
        case 'store_media':
          d.runJob(() => d.storeInboundMedia({ messageId: followUp.messageId }, ctx), {
            requestId: ctx.requestId,
            route,
            messageId: followUp.messageId,
          });
          break;
        case 'ai_reply':
          d.runJob(
            () =>
              d.generateAiReply(
                { contactId: followUp.contactId, triggerMessageId: followUp.triggerMessageId },
                ctx,
              ),
            {
              requestId: ctx.requestId,
              route,
              contactId: followUp.contactId,
              messageId: followUp.triggerMessageId,
            },
          );
          break;
      }
    }
  },

  /** POST /api/knowledge/documents and .../:id/retry: phase B of IngestDocument after the 202. */
  scheduleDocumentExtraction: (
    followUp: ExtractFollowUp,
    ctx: RequestContext,
    route: string,
  ): void => {
    const d = deps();
    d.runJob(() => d.extractDocument(followUp), {
      requestId: ctx.requestId,
      route,
      documentId: followUp.documentId,
    });
  },
});
