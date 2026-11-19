import type { ContactNote } from '@/core/domain';
import type { ContactNoteRepository } from '@/core/ports';
import type { FakeContactRepository } from './fake-contact-repository';

const newestFirst = (a: ContactNote, b: ContactNote): number =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** In-memory notes. With `contacts` it checks the foreign key like the database. */
export class FakeContactNoteRepository implements ContactNoteRepository {
  private readonly rows = new Map<string, ContactNote>();
  private readonly contacts: FakeContactRepository | null;

  constructor(opts: { contacts?: FakeContactRepository } = {}) {
    this.contacts = opts.contacts ?? null;
  }

  readonly insert: ContactNoteRepository['insert'] = (note) => {
    if (this.contacts && !this.contacts.peek(note.contactId)) {
      return Promise.reject(new Error('FakeContactNoteRepository: contactId does not exist'));
    }
    if (this.rows.has(note.id)) {
      return Promise.reject(new Error('FakeContactNoteRepository: duplicate id'));
    }
    this.rows.set(note.id, structuredClone(note));
    return Promise.resolve(structuredClone(note));
  };

  readonly listForContact: ContactNoteRepository['listForContact'] = (contactId, limit) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((n) => n.contactId === contactId)
        .sort(newestFirst)
        .slice(0, limit)
        .map((n) => structuredClone(n)),
    );

  readonly delete: ContactNoteRepository['delete'] = (contactId, id) => {
    const row = this.rows.get(id);
    if (row?.contactId !== contactId) return Promise.resolve(false);
    this.rows.delete(id);
    return Promise.resolve(true);
  };
}
