// Pure logic of the admin notes in the customer info panel (ui-screens 6, "โน้ต").
import { CONTACT_NOTE_MAX_CHARS, type ContactNoteDto } from '@/contracts';
import { copy } from '../inbox.constants';
import { fillCopy } from './inbox.thread.logic';

/** A note on screen: a saved one, or one being added (`pending`) with a temporary id. */
export type NoteItem = ContactNoteDto & { pending?: true };

/** The typed note: what is sent (trimmed) or why it cannot be. */
export function checkNote(
  typed: string,
): { ok: true; text: string } | { ok: false; code: 'empty' | 'too_long' } {
  const text = typed.trim();
  if (text === '') return { ok: false, code: 'empty' };
  if (text.length > CONTACT_NOTE_MAX_CHARS) return { ok: false, code: 'too_long' };
  return { ok: true, text };
}

/** "12/1000" under the field; it counts what is typed, as the limit applies after trimming. */
export function noteCounterText(typed: string): string {
  return fillCopy(copy.notes.counter, { n: typed.trim().length, max: CONTACT_NOTE_MAX_CHARS });
}

/** Text under the field when the note is too long. */
export function noteTooLongText(): string {
  return fillCopy(copy.notes.tooLong, { max: CONTACT_NOTE_MAX_CHARS });
}

/** Enter adds; Shift+Enter (and composing an IME word) keeps typing. */
export function isAddKey(e: { key: string; shiftKey: boolean; isComposing: boolean }): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/** The list with an optimistic note at the top. */
export function withPendingNote(list: readonly NoteItem[], note: NoteItem): NoteItem[] {
  return [{ ...note, pending: true }, ...list.filter((n) => n.id !== note.id)];
}

/** The list once the server answered: the pending note becomes the saved one. */
export function confirmPendingNote(
  list: readonly NoteItem[],
  tempId: string,
  saved: ContactNoteDto,
): NoteItem[] {
  return [saved, ...list.filter((n) => n.id !== tempId && n.id !== saved.id)];
}

/** The list without one note (a failed add, or a delete). */
export function withoutNote(list: readonly NoteItem[], id: string): NoteItem[] {
  return list.filter((n) => n.id !== id);
}
