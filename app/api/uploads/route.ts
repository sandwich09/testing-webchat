import { issueUpload, json, toUploadTicketDto, withRoute } from '@/composition';
import { issueUploadBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { route: '/api/uploads', access: 'cookie', body: issueUploadBodySchema },
  async ({ body, ctx }) => {
    const r = await issueUpload(body, ctx);
    if (!r.ok) return r;
    return json(toUploadTicketDto(r.value));
  },
);
