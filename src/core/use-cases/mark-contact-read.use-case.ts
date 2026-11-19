import type { Contact, ContactId } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type MarkContactReadInput = { contactId: ContactId };

export type MarkContactReadOutput = Contact;

export type MarkContactReadDeps = Pick<AllPorts, 'contacts'>;

export const makeMarkContactRead: (
  deps: MarkContactReadDeps,
  config: UseCaseConfig,
) => UseCase<MarkContactReadInput, MarkContactReadOutput, 'contact.not_found'> =
  ({ contacts }) =>
  async ({ contactId }) => {
    const contact = await contacts.findById(contactId);
    if (contact === null) return err('contact.not_found');

    // Setting the count to zero is idempotent, so repeated calls from the polling page are safe.
    await contacts.markRead(contactId);

    const updated = await contacts.findById(contactId);
    return updated === null ? err('contact.not_found') : ok(updated);
  };
