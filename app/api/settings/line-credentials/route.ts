import { json, setLineCredentials, toSetLineCredentialsInput, withRoute } from '@/composition';
import { setLineCredentialsBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = withRoute(
  {
    route: '/api/settings/line-credentials',
    access: 'cookie',
    body: setLineCredentialsBodySchema,
  },
  async ({ body, ctx }) => {
    const r = await setLineCredentials(toSetLineCredentialsInput(body), ctx);
    if (!r.ok) return r;
    return json({
      botName: r.value.botName,
      basicId: r.value.basicId,
      secretStatus: r.value.secretStatus,
    });
  },
);
