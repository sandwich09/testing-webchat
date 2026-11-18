import { json, testLineConnection, withRoute } from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { route: '/api/settings/line/test', access: 'cookie' },
  async ({ ctx }) => {
    const r = await testLineConnection({}, ctx);
    if (!r.ok) return r;
    return json({ botName: r.value.botName, basicId: r.value.basicId });
  },
);
