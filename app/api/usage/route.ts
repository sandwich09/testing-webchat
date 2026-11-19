import { getUsageReport, json, toUsageReportResponse, usageMonth, withRoute } from '@/composition';
import { usageQuerySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { route: '/api/usage', access: 'cookie', query: usageQuerySchema },
  async ({ query, ctx }) => {
    const r = await getUsageReport({ month: usageMonth(query.month) }, ctx);
    if (!r.ok) return r;
    return json(toUsageReportResponse(r.value));
  },
);
