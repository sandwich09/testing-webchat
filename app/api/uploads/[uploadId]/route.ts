import { asUploadId, discardUpload, noContent, withRoute } from '@/composition';
import { discardUploadParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withRoute(
  { route: '/api/uploads/:uploadId', access: 'cookie', params: discardUploadParamsSchema },
  async ({ params, ctx }) => {
    const r = await discardUpload({ uploadId: asUploadId(params.uploadId) }, ctx);
    if (!r.ok) return r;
    return noContent();
  },
);
