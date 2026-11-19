import {
  addContactNote,
  asContactId,
  json,
  listContactNotes,
  toContactNoteDto,
  withRoute,
} from '@/composition';
import { addContactNoteBodySchema, contactParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { route: '/api/contacts/:id/notes', access: 'cookie', params: contactParamsSchema },
  async ({ params, ctx }) => {
    const r = await listContactNotes({ contactId: asContactId(params.id) }, ctx);
    if (!r.ok) return r;
    return json({ notes: r.value.map(toContactNoteDto) });
  },
);

export const POST = withRoute(
  {
    route: '/api/contacts/:id/notes',
    access: 'cookie',
    params: contactParamsSchema,
    body: addContactNoteBodySchema,
  },
  async ({ params, body, ctx }) => {
    const r = await addContactNote({ contactId: asContactId(params.id), text: body.text }, ctx);
    if (!r.ok) return r;
    return json(toContactNoteDto(r.value), 201);
  },
);
