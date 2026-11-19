import { accessGrantedResponse, unlockAccess, withRoute } from '@/composition';
import { unlockBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { route: '/api/access/unlock', access: 'open', body: unlockBodySchema },
  async ({ body, ctx }) => {
    const r = await unlockAccess({ code: body.code }, ctx);
    if (!r.ok) return r;
    return accessGrantedResponse(r.value.token);
  },
);
