import type {
  ExtractDocument,
  ExtractFollowUp,
  FollowUpJob,
  RequestContext,
  UseCase,
  GenerateAiReplyInput,
  GenerateAiReplyOutput,
  HandleRichMenuActionInput,
  HandleRichMenuActionOutput,
  RefreshContactProfileInput,
  RefreshContactProfileOutput,
  SendWelcomeInput,
  SendWelcomeOutput,
  StoreInboundMediaInput,
  StoreInboundMediaOutput,
} from '@/core/use-cases';
import type { RunJob } from './route';

export interface JobDeps {
  runJob: RunJob;
  storeInboundMedia: UseCase<StoreInboundMediaInput, StoreInboundMediaOutput>;
  generateAiReply: UseCase<GenerateAiReplyInput, GenerateAiReplyOutput>;
  handleRichMenuAction: UseCase<HandleRichMenuActionInput, HandleRichMenuActionOutput>;
  sendWelcome: UseCase<SendWelcomeInput, SendWelcomeOutput>;
  refreshContactProfile: UseCase<RefreshContactProfileInput, RefreshContactProfileOutput>;
  extractDocument: ExtractDocument;
}

/** The after-response work routes hand over, each through `runJob`. */
export const makeJobs = (deps: () => JobDeps) => ({
  /**
   * POST /api/line/webhook: every follow-up of ReceiveLineEvents runs after the 200, each in
   * its own job: `store_media` → StoreInboundMedia, `ai_reply` → GenerateAiReply,
   * `rich_menu_action` → HandleRichMenuAction (then GenerateAiReply in the same job when it starts
   * the AI), `welcome` → SendWelcome, `refresh_profile` → RefreshContactProfile.
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
        case 'rich_menu_action':
          d.runJob(
            async () => {
              const handled = await d.handleRichMenuAction(
                {
                  contactId: followUp.contactId,
                  action: followUp.action,
                  tapMessageId: followUp.tapMessageId,
                },
                ctx,
              );
              if (handled.ok && handled.value.aiReply !== null) {
                await d.generateAiReply(handled.value.aiReply, ctx);
              }
            },
            {
              requestId: ctx.requestId,
              route,
              contactId: followUp.contactId,
              messageId: followUp.tapMessageId,
            },
          );
          break;
        case 'welcome':
          d.runJob(
            () =>
              d.sendWelcome(
                { contactId: followUp.contactId, replyToken: followUp.replyToken },
                ctx,
              ),
            { requestId: ctx.requestId, route, contactId: followUp.contactId },
          );
          break;
        case 'refresh_profile':
          d.runJob(() => d.refreshContactProfile({ contactId: followUp.contactId }, ctx), {
            requestId: ctx.requestId,
            route,
            contactId: followUp.contactId,
          });
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
