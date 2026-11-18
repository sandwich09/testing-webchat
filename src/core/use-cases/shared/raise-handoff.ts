import type { Contact, HandoffReason } from '@/core/domain';
import type { AllPorts } from '../types';

export type RaiseHandoffDeps = Pick<AllPorts, 'contacts' | 'messages' | 'ids' | 'clock' | 'logger'>;

export type RaiseHandoff = (contact: Contact, reason: HandoffReason) => Promise<void>;

/** Marks the contact as waiting for an admin and adds one event line to the chat. */
export const makeRaiseHandoff: (deps: RaiseHandoffDeps) => RaiseHandoff =
  ({ contacts, messages, ids, clock, logger }) =>
  async (contact, reason) => {
    // Same reason already raised: no second event line (e.g. budget reached on every message).
    if (contact.needsAdmin && contact.needsAdminReason === reason) return;

    await contacts.setNeedsAdmin(contact.id, reason);
    await messages.insertEvent({
      id: ids.messageId(),
      contactId: contact.id,
      direction: 'internal',
      author: 'system',
      type: 'event',
      text: null,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: `handoff.${reason}`,
      lineMessageId: null,
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: clock.now(),
      sentAt: null,
    });
    logger.log('info', 'ai.reply.handoff', { contactId: contact.id, reason });
  };
