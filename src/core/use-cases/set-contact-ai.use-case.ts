import type { Contact, ContactId } from '@/core/domain';
import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type SetContactAiInput = { contactId: ContactId; aiEnabled: boolean };

export type SetContactAiOutput = Contact;

export type SetContactAiDeps = Pick<AllPorts, 'contacts' | 'settings'>;

export const makeSetContactAi: (
  deps: SetContactAiDeps,
  config: UseCaseConfig,
) => UseCase<SetContactAiInput, SetContactAiOutput, 'contact.not_found' | 'ai.disabled_globally'> =
  ({ contacts, settings }) =>
  async ({ contactId, aiEnabled }) => {
    const contact = await contacts.findById(contactId);
    if (contact === null) return err('contact.not_found');

    // Turning on needs the kill switch on; turning off always works. The stored per-contact value
    // is otherwise independent of the kill switch (docs/specs/ai-reply.md#สวิตช์สองระดับ).
    if (aiEnabled && !(await settings.get()).aiEnabled) return err('ai.disabled_globally');

    await contacts.setAiEnabled(contactId, aiEnabled);
    // Turning on hands the chat back to the AI, so it no longer waits for an admin.
    if (aiEnabled && contact.needsAdmin) await contacts.clearNeedsAdmin(contactId);

    const updated = await contacts.findById(contactId);
    return updated === null ? err('contact.not_found') : ok(updated);
  };
