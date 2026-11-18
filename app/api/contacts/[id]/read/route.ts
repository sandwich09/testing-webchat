import { asContactId, json, markContactRead, toContactDto, withRoute } from '@/composition';
import { contactParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { route: '/api/contacts/:id/read', access: 'cookie', params: contactParamsSchema },
  async ({ params, ctx }) => {
    const r = await markContactRead({ contactId: asContactId(params.id) }, ctx);
    if (!r.ok) return r;
    return json(toContactDto(r.value));
  },
);
