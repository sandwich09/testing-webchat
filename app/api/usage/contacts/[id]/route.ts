import {
  asContactId,
  getContactUsage,
  json,
  toContactUsageResponse,
  usageMonth,
  withRoute,
} from '@/composition';
import { contactUsageParamsSchema, usageQuerySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(
  {
    route: '/api/usage/contacts/:id',
    access: 'cookie',
    params: contactUsageParamsSchema,
    query: usageQuerySchema,
  },
  async ({ params, query, ctx }) => {
    const r = await getContactUsage(
      { contactId: asContactId(params.id), month: usageMonth(query.month) },
      ctx,
    );
    if (!r.ok) return r;
    return json(toContactUsageResponse(r.value));
  },
);
