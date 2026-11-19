import { asContactId, json, showTypingToCustomer, withRoute } from '@/composition';
import { contactParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { route: '/api/contacts/:id/typing', access: 'cookie', params: contactParamsSchema },
  async ({ params, ctx }) => {
    const r = await showTypingToCustomer({ contactId: asContactId(params.id) }, ctx);
    if (!r.ok) return r;
    return json({ shown: r.value.shown });
  },
);
