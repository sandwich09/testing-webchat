import {
  json,
  listContacts,
  toListContactsInput,
  toListContactsResponse,
  withRoute,
} from '@/composition';
import { listContactsQuerySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { route: '/api/contacts', access: 'cookie', query: listContactsQuerySchema },
  async ({ query, ctx }) => {
    const input = toListContactsInput(query);
    if (!input.ok) return input;
    const r = await listContacts(input.value, ctx);
    if (!r.ok) return r;
    return json(toListContactsResponse(r.value));
  },
);
