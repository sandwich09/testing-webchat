import type { ContactId, ContactNote } from '@/core/domain';
import { CONTACT_NOTE_LIST_LIMIT, err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ListContactNotesInput = { contactId: ContactId };
export type ListContactNotesOutput = ContactNote[];
export type ListContactNotesDeps = Pick<AllPorts, 'contacts' | 'notes'>;

/** The admin notes of a contact, newest first (webchat-inbox "โน้ตของแอดมิน"). */
export const makeListContactNotes: (
  deps: ListContactNotesDeps,
  config: UseCaseConfig,
) => UseCase<ListContactNotesInput, ListContactNotesOutput, 'contact.not_found'> =
  ({ contacts, notes }) =>
  async ({ contactId }) => {
    if ((await contacts.findById(contactId)) === null) return err('contact.not_found');
    return ok(await notes.listForContact(contactId, CONTACT_NOTE_LIST_LIMIT));
  };
