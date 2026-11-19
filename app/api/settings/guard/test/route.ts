import { json, testTopicGuard, toTestTopicGuardResponse, withRoute } from '@/composition';
import { testTopicGuardBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { route: '/api/settings/guard/test', access: 'cookie', body: testTopicGuardBodySchema },
  async ({ body, ctx }) => {
    const r = await testTopicGuard({ text: body.text }, ctx);
    if (!r.ok) return r;
    return json(toTestTopicGuardResponse(r.value));
  },
);
