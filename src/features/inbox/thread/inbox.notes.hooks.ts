'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { qk } from '@/common/query-keys';
import type { ContactNoteDto } from '@/contracts';
import { addContactNote, deleteContactNote, listContactNotes } from '../inbox.api';
import {
  confirmPendingNote,
  withPendingNote,
  withoutNote,
  type NoteItem,
} from './inbox.notes.logic';

/** The notes of a contact. Loaded when the panel opens and again after each change; no polling. */
export function useContactNotes(contactId: string) {
  return useQuery<NoteItem[]>({
    queryKey: qk.contactNotes(contactId),
    queryFn: ({ signal }) => listContactNotes(contactId, signal),
    staleTime: 0,
    retry: 0,
  });
}

/**
 * Adds a note at the top of the list at once (optimistic). On failure the note leaves the list
 * and the caller puts the typed text back. The list loads again once the add has settled: an add
 * made before the first load finished cancels that load, and the saved notes would otherwise
 * stay hidden behind the one just added.
 */
export function addContactNoteOptions(
  client: QueryClient,
  contactId: string,
  add: (contactId: string, text: string) => Promise<ContactNoteDto> = addContactNote,
) {
  const key = qk.contactNotes(contactId);
  return {
    mutationFn: (v: { text: string; tempId: string; at: string }) => add(contactId, v.text),
    onMutate: async (v: { text: string; tempId: string; at: string }) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<NoteItem[]>(key, (old) =>
        withPendingNote(old ?? [], { id: v.tempId, contactId, text: v.text, createdAt: v.at }),
      );
    },
    onSuccess: (saved: ContactNoteDto, v: { tempId: string }) => {
      client.setQueryData<NoteItem[]>(key, (old) => confirmPendingNote(old ?? [], v.tempId, saved));
    },
    onError: (_error: unknown, v: { tempId: string }) => {
      client.setQueryData<NoteItem[]>(key, (old) => withoutNote(old ?? [], v.tempId));
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  };
}

export function useAddContactNote(contactId: string) {
  const client = useQueryClient();
  return useMutation(addContactNoteOptions(client, contactId));
}

/** Deletes a note after the admin confirmed; the list loads again either way. */
export function useDeleteContactNote(contactId: string) {
  const client = useQueryClient();
  const key = qk.contactNotes(contactId);
  return useMutation({
    mutationFn: (noteId: string) => deleteContactNote(contactId, noteId),
    onSuccess: (_r, noteId) => {
      client.setQueryData<NoteItem[]>(key, (old) => withoutNote(old ?? [], noteId));
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
