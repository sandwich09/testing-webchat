import { err, ok, type Contact, type ContactId } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type GetContactInput = { contactId: ContactId };

export type GetContactOutput = {
  contact: Contact;
  stats: { messageCount: number; aiMessageCount: number };
};

export type GetContactDeps = Pick<AllPorts, 'contacts' | 'messages'>;

export const makeGetContact: (
  deps: GetContactDeps,
  config: UseCaseConfig,
) => UseCase<GetContactInput, GetContactOutput, 'contact.not_found'> =
  ({ contacts, messages }) =>
  async ({ contactId }) => {
    const contact = await contacts.findById(contactId);
    if (contact === null) return err('contact.not_found');
    const { total, byAi } = await messages.countForContact(contactId);
    return ok({ contact, stats: { messageCount: total, aiMessageCount: byAi } });
  };
