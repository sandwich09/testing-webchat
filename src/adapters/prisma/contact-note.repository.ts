import type { ContactId, ContactNote, NoteId } from '@/core/domain';
import type { ContactNoteRepository } from '@/core/ports';
import type { ContactNote as ContactNoteRow } from './generated/client';
import type { PrismaClient } from './prisma-client';

const toNote = (row: ContactNoteRow): ContactNote => ({
  id: row.id as NoteId, // brand: id read back from the ContactNote table
  contactId: row.contactId as ContactId, // brand: foreign key to Contact
  text: row.text,
  createdAt: row.createdAt,
});

export function createContactNoteRepository(client: PrismaClient): ContactNoteRepository {
  return {
    async insert(note) {
      return toNote(
        await client.contactNote.create({
          data: {
            id: note.id,
            contactId: note.contactId,
            text: note.text,
            createdAt: note.createdAt,
          },
        }),
      );
    },

    async listForContact(contactId, limit) {
      const rows = await client.contactNote.findMany({
        where: { contactId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return rows.map(toNote);
    },

    async delete(contactId, id) {
      // One statement scoped to the contact, so a note of another contact is never removed.
      const { count } = await client.contactNote.deleteMany({ where: { id, contactId } });
      return count === 1;
    },
  };
}
