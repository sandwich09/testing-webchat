import { getGuardrailStats, json, toGuardrailStatsDto, withRoute } from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { route: '/api/system/guardrails', access: 'cookie' },
  async ({ ctx }) => {
    const r = await getGuardrailStats({}, ctx);
    if (!r.ok) return r;
    return json(toGuardrailStatsDto(r.value));
  },
);
