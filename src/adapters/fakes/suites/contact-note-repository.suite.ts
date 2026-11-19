import { beforeEach, describe, expect, it } from 'vitest';
import type { ContactId, ContactNote, LineUserId, NoteId } from '@/core/domain';
import type { ContactNoteRepository, ContactRepository } from '@/core/ports';

/** Notes need contacts: ContactNote.contactId is a foreign key. */
export interface ContactNoteRepositorySuiteHarness {
  notes: ContactNoteRepository;
  contacts: ContactRepository;
}

const uuid = (prefix: string, n: number): string =>
  `${prefix}-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const contactId = (n: number): ContactId => uuid('00000000', n) as ContactId; // brand: test id
const noteId = (n: number): NoteId => uuid('22222222', n) as NoteId; // brand: test id
const lineUser = (n: number): LineUserId => `U${n.toString(16).padStart(32, '0')}` as LineUserId; // brand: test id
const at = (second: number): Date => new Date(Date.UTC(2026, 10, 18, 3, 0, second));

const note = (contact: ContactId, n: number, second = n): ContactNote => ({
  id: noteId(n),
  contactId: contact,
  text: `โน้ต ${String(n)}\nบรรทัดสอง`,
  createdAt: at(second),
});

/**
 * Runs the ContactNoteRepository contract (domain-and-ports) against the subject. `makeHarness`
 * returns both repositories over empty tables backed by the same store.
 */
export const describeContactNoteRepositorySuite = (
  makeHarness: () => ContactNoteRepositorySuiteHarness | Promise<ContactNoteRepositorySuiteHarness>,
): void => {
  describe('ContactNoteRepository contract', () => {
    let notes: ContactNoteRepository;
    const A = contactId(1);
    const B = contactId(2);

    beforeEach(async () => {
      const h = await makeHarness();
      notes = h.notes;
      await h.contacts.ensure({ id: A, lineUserId: lineUser(1), now: at(0) });
      await h.contacts.ensure({ id: B, lineUserId: lineUser(2), now: at(0) });
    });

    it('insert returns the note with every field and the text unchanged', async () => {
      expect(await notes.insert(note(A, 1))).toEqual(note(A, 1));
    });

    it('lists the notes of one contact newest first, the id breaking ties, up to the limit', async () => {
      await notes.insert(note(A, 1, 10));
      await notes.insert(note(A, 2, 30));
      await notes.insert(note(A, 3, 20));
      await notes.insert(note(A, 4, 30));
      await notes.insert(note(B, 5, 40));
      expect((await notes.listForContact(A, 10)).map((n) => n.id)).toEqual([
        noteId(4),
        noteId(2),
        noteId(3),
        noteId(1),
      ]);
      expect((await notes.listForContact(A, 2)).map((n) => n.id)).toEqual([noteId(4), noteId(2)]);
      expect(await notes.listForContact(contactId(9), 10)).toEqual([]);
    });

    it('deletes a note of that contact only, and answers false for an unknown one', async () => {
      await notes.insert(note(A, 1));
      expect(await notes.delete(B, noteId(1))).toBe(false);
      expect(await notes.listForContact(A, 10)).toHaveLength(1);
      expect(await notes.delete(A, noteId(1))).toBe(true);
      expect(await notes.delete(A, noteId(1))).toBe(false);
      expect(await notes.listForContact(A, 10)).toEqual([]);
    });

    it('rejects a note of a contact that does not exist', async () => {
      await expect(notes.insert(note(contactId(9), 1))).rejects.toThrow();
    });
  });
};
