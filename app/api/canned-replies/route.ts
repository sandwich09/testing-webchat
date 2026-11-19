import {
  json,
  listCannedReplies,
  saveCannedReply,
  toCannedReplyDto,
  toCreateCannedReplyInput,
  toListCannedRepliesResponse,
  withRoute,
} from '@/composition';
import { createCannedReplyBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/canned-replies';

export const GET = withRoute({ route, access: 'cookie' }, async ({ ctx }) => {
  const r = await listCannedReplies({}, ctx);
  if (!r.ok) return r;
  return json(toListCannedRepliesResponse(r.value));
});

export const POST = withRoute(
  { route, access: 'cookie', body: createCannedReplyBodySchema },
  async ({ body, ctx }) => {
    const r = await saveCannedReply(toCreateCannedReplyInput(body), ctx);
    if (!r.ok) return r;
    return json(toCannedReplyDto(r.value), 201);
  },
);
