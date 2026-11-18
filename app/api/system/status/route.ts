import { getSystemStatus, json, toSystemStatusDto, withRoute } from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute({ route: '/api/system/status', access: 'cookie' }, async ({ ctx }) => {
  const r = await getSystemStatus({}, ctx);
  if (!r.ok) return r;
  return json(toSystemStatusDto(r.value));
});
