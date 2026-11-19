import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { qk } from '@/common/query-keys';
import type { ContactNoteDto } from '@/contracts';

import { addContactNoteOptions } from './inbox.notes.hooks';
import type { NoteItem } from './inbox.notes.logic';

const note = (id: string, text: string): ContactNoteDto => ({
  id,
  contactId: 'c1',
  text,
  createdAt: '2026-11-18T03:00:00.000Z',
});

/** A promise and the function that settles it, for a request the test answers later. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('adding a note before the notes list has loaded', () => {
  it('shows the saved notes and the new one once the add has settled', async () => {
    const client = new QueryClient();
    const key = qk.contactNotes('c1');
    const server: ContactNoteDto[] = [note('n1', 'saved before')];
    const firstLoad = deferred<ContactNoteDto[]>();
    let loads = 0;
    const list = new QueryObserver<NoteItem[]>(client, {
      queryKey: key,
      queryFn: () => {
        loads += 1;
        return loads === 1 ? firstLoad.promise : Promise.resolve([...server]);
      },
      retry: 0,
      staleTime: 0,
    });
    const unsubscribe = list.subscribe(() => undefined);

    const add = new MutationObserver(
      client,
      addContactNoteOptions(client, 'c1', (_id, text) => {
        const saved = note('n2', text);
        server.unshift(saved);
        return Promise.resolve(saved);
      }),
    );
    await add.mutate({ text: 'new', tempId: 'pending-1', at: '2026-11-18T03:01:00.000Z' });
    firstLoad.resolve([note('n1', 'saved before')]);
    await new Promise((r) => setTimeout(r, 0));
    await client.getQueryCache().find({ queryKey: key })?.promise;

    expect(client.getQueryData<NoteItem[]>(key)?.map((n) => n.id)).toEqual(['n2', 'n1']);
    unsubscribe();
  });
});
