import { checkHealth, json, withRoute } from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute({ route: '/api/health', access: 'open' }, async ({ ctx }) => {
  const r = await checkHealth({}, ctx);
  if (!r.ok) return r;
  return json({ status: 'ok' });
});
