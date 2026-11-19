import type { Contact, ContactId, Message, MessageId, RichMenuAction } from '@/core/domain';
import {
  adminRequestedText,
  aiBudgetReachedText,
  aiUnavailableText,
  bangkokDayRange,
  howToTextOf,
  ok,
  previewOf,
} from '@/core/domain';
import { makeDeliverOutbound } from './shared/deliver-outbound';
import { makeLoadLineAccess } from './shared/load-line-access';
import { makeRaiseHandoff } from './shared/raise-handoff';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type HandleRichMenuActionInput = {
  contactId: ContactId;
  action: RichMenuAction;
  /** The stored tap (ReceiveLineEvents); the AI answers it when the action starts the AI. */
  tapMessageId: MessageId;
};

export type RichMenuActionOutcome =
  /** The AI was switched on (or already on); GenerateAiReply greets from the tap. */
  | 'ai_started'
  | 'ai_unavailable'
  | 'ai_budget_reached'
  | 'admin_requested'
  | 'how_to_sent'
  | 'contact_missing';

export type HandleRichMenuActionOutput = {
  outcome: RichMenuActionOutcome;
  /** The GenerateAiReply job to run next, or null. */
  aiReply: { contactId: ContactId; triggerMessageId: MessageId } | null;
};

export type HandleRichMenuActionDeps = Pick<
  AllPorts,
  'settings' | 'cipher' | 'contacts' | 'messages' | 'usage' | 'gateway' | 'ids' | 'clock' | 'logger'
>;

/**
 * The buttons of the rich menu and of the welcome card (specs/line-messaging.md "Rich menu").
 * Fixed replies never call the model; they go out like every other message (reply token first,
 * push otherwise). "คุยกับ AI" goes through GenerateAiReply, which re-checks every condition.
 */
export const makeHandleRichMenuAction: (
  deps: HandleRichMenuActionDeps,
  config: UseCaseConfig,
) => UseCase<HandleRichMenuActionInput, HandleRichMenuActionOutput> = (deps) => {
  const { settings, contacts, messages, usage, ids, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);
  const raiseHandoff = makeRaiseHandoff(deps);
  const deliverOutbound = makeDeliverOutbound(deps);

  /** Stores and sends one fixed text as an automatic (author ai) message. */
  const sendFixed = async (contactId: ContactId, text: string): Promise<Message | null> => {
    const id = ids.messageId();
    const { message } = await messages.insertOutboundIfAbsent({
      id,
      contactId,
      direction: 'outbound',
      author: 'ai',
      type: 'text',
      text,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: null,
      lineMessageId: null,
      deliveryStatus: 'pending',
      deliveryError: null,
      retryKey: id,
      createdAt: clock.now(),
      sentAt: null,
    });
    await contacts.recordOutbound(contactId, { preview: previewOf(message), by: 'ai' });
    const access = await loadLineAccess();
    const contact = await contacts.findById(contactId);
    if (!access.ok || contact === null) {
      // Kept as failed so the admin sees it and can send it again once LINE is set up.
      await messages.markFailed(message.id, access.ok ? 'contact.not_found' : access.error.code);
      return null;
    }
    return deliverOutbound(message, contact, access.value, 'auto');
  };

  /** raiseHandoff with the row read now, so a cleared flag is raised again. */
  const handoff = async (
    c: Contact,
    reason: 'ai_unavailable' | 'budget_reached' | 'customer_asked_admin',
  ) => {
    const fresh = await contacts.findById(c.id);
    if (fresh !== null) await raiseHandoff(fresh, reason);
  };

  const done = (
    contactId: ContactId,
    action: RichMenuAction,
    outcome: RichMenuActionOutcome,
    aiReply: HandleRichMenuActionOutput['aiReply'] = null,
  ) => {
    logger.log('info', 'line.rich_menu.action_handled', { contactId, reason: action, outcome });
    return ok({ outcome, aiReply });
  };

  return async ({ contactId, action, tapMessageId }) => {
    const c = await contacts.findById(contactId);
    if (c === null) return done(contactId, action, 'contact_missing');
    const s = await settings.get();
    const particle = s.aiPoliteParticle;

    switch (action) {
      case 'ai_on': {
        if (!s.aiEnabled) {
          await handoff(c, 'ai_unavailable');
          await sendFixed(c.id, aiUnavailableText(particle));
          return done(c.id, action, 'ai_unavailable');
        }
        const todayCost = await usage.sumCost(bangkokDayRange(clock.now()));
        if (todayCost >= s.aiDailyBudget) {
          await handoff(c, 'budget_reached');
          await sendFixed(c.id, aiBudgetReachedText(particle));
          return done(c.id, action, 'ai_budget_reached');
        }
        // Same as the admin's switch: on hands the chat back to the AI.
        if (!c.aiEnabled) await contacts.setAiEnabled(c.id, true);
        if (c.needsAdmin) await contacts.clearNeedsAdmin(c.id);
        // Read after the switch is on: a text that came with or right after the tap while the AI
        // was still off has no job of its own (ReceiveLineEvents reads the switch after storing
        // it), so the run answers the latest message, not the tap that a newer text supersedes.
        const latest = await messages.latestInbound(c.id);
        return done(c.id, action, 'ai_started', {
          contactId: c.id,
          triggerMessageId: latest?.id ?? tapMessageId,
        });
      }
      case 'admin': {
        if (c.aiEnabled) await contacts.setAiEnabled(c.id, false);
        await handoff(c, 'customer_asked_admin');
        await sendFixed(c.id, adminRequestedText(particle));
        return done(c.id, action, 'admin_requested');
      }
      case 'how_to': {
        await sendFixed(c.id, howToTextOf(s.howToText, particle));
        return done(c.id, action, 'how_to_sent');
      }
    }
  };
};
