import type { ContactId, ContactNote } from '@/core/domain';
import { err, ok } from '@/core/domain';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

/** `text` is trimmed and 1 to CONTACT_NOTE_MAX_CHARS characters (the route checked it). */
export type AddContactNoteInput = { contactId: ContactId; text: string };
export type AddContactNoteOutput = ContactNote;
export type AddContactNoteDeps = Pick<
  AllPorts,
  'contacts' | 'notes' | 'rateLimits' | 'hasher' | 'ids' | 'clock' | 'logger'
>;

/**
 * Adds an admin note to a contact. Rate-limited per caller like other writes. The text never
 * leaves the database: not to LINE, not to the AI model, not to the log.
 */
export const makeAddContactNote: (
  deps: AddContactNoteDeps,
  config: UseCaseConfig,
) => UseCase<
  AddContactNoteInput,
  AddContactNoteOutput,
  'contact.not_found' | 'note.rate_limited'
> = (deps, config) => {
  const { contacts, notes, ids, clock, logger } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);
  return async ({ contactId, text }, ctx) => {
    const now = clock.now();
    const limit = await hitRateLimit('note_create', ctx.clientIp ?? 'unknown', now);
    if (limit.limited) {
      logger.log('warn', 'contact.note.rate_limited', { contactId });
      return err('note.rate_limited', undefined, limit.retryAfterSeconds);
    }
    if ((await contacts.findById(contactId)) === null) return err('contact.not_found');
    const note = await notes.insert({ id: ids.noteId(), contactId, text, createdAt: now });
    logger.log('info', 'contact.note.added', { contactId });
    return ok(note);
  };
};
