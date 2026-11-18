import {
  asCannedReplyId,
  deleteCannedReply,
  json,
  noContent,
  saveCannedReply,
  toCannedReplyDto,
  toUpdateCannedReplyInput,
  withRoute,
} from '@/composition';
import { cannedReplyParamsSchema, updateCannedReplyBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/canned-replies/:id';

export const PATCH = withRoute(
  {
    route,
    access: 'cookie',
    params: cannedReplyParamsSchema,
    body: updateCannedReplyBodySchema,
  },
  async ({ params, body, ctx }) => {
    const r = await saveCannedReply(toUpdateCannedReplyInput(params.id, body), ctx);
    if (!r.ok) return r;
    return json(toCannedReplyDto(r.value));
  },
);

export const DELETE = withRoute(
  { route, access: 'cookie', params: cannedReplyParamsSchema },
  async ({ params, ctx }) => {
    const r = await deleteCannedReply({ id: asCannedReplyId(params.id) }, ctx);
    if (!r.ok) return r;
    return noContent();
  },
);
