import type { ContactId, ContactNote, NoteId } from '@/core/domain';

/** Admin notes of a contact (domain-and-ports "ContactNoteRepository"). */
export interface ContactNoteRepository {
  insert(note: ContactNote): Promise<ContactNote>;
  /** Newest first (createdAt, then id), at most `limit`. */
  listForContact(contactId: ContactId, limit: number): Promise<ContactNote[]>;
  /** Deletes the note of that contact. false when there is none (or it is another contact's). */
  delete(contactId: ContactId, id: NoteId): Promise<boolean>;
}
