import type { ContactId, NoteId } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type DeleteContactNoteInput = { contactId: ContactId; noteId: NoteId };
export type DeleteContactNoteOutput = { deleted: true };
export type DeleteContactNoteDeps = Pick<AllPorts, 'notes' | 'logger'>;

/** Deletes one admin note of the contact. A note of another contact is `note.not_found`. */
export const makeDeleteContactNote: (
  deps: DeleteContactNoteDeps,
  config: UseCaseConfig,
) => UseCase<DeleteContactNoteInput, DeleteContactNoteOutput, 'note.not_found'> =
  ({ notes, logger }) =>
  async ({ contactId, noteId }) => {
    if (!(await notes.delete(contactId, noteId))) return err('note.not_found');
    logger.log('info', 'contact.note.deleted', { contactId });
    return ok({ deleted: true });
  };
