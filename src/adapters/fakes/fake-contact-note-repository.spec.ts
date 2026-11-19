import { FakeContactNoteRepository } from './fake-contact-note-repository';
import { FakeContactRepository } from './fake-contact-repository';
import { describeContactNoteRepositorySuite } from './suites/contact-note-repository.suite';

describeContactNoteRepositorySuite(() => {
  const contacts = new FakeContactRepository();
  return { contacts, notes: new FakeContactNoteRepository({ contacts }) };
});
