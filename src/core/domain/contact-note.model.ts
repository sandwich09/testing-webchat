import type { ContactId, NoteId } from './ids';

/**
 * A note an admin wrote about a contact (specs/webchat-inbox.md "โน้ตของแอดมิน"). Admin-only: it is
 * never sent to LINE, never part of anything sent to the AI model and never logged.
 */
export interface ContactNote {
  id: NoteId;
  contactId: ContactId;
  /** Trimmed, 1 to CONTACT_NOTE_MAX_CHARS characters. */
  text: string;
  createdAt: Date;
}
