import { asContactId, asNoteId, deleteContactNote, json, withRoute } from '@/composition';
import { contactNoteParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withRoute(
  { route: '/api/contacts/:id/notes/:noteId', access: 'cookie', params: contactNoteParamsSchema },
  async ({ params, ctx }) => {
    const r = await deleteContactNote(
      { contactId: asContactId(params.id), noteId: asNoteId(params.noteId) },
      ctx,
    );
    if (!r.ok) return r;
    return json(r.value);
  },
);
