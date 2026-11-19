import {
  asContactId,
  asMessageId,
  json,
  retryMessage,
  toMessageDto,
  withRoute,
} from '@/composition';
import { retryMessageParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withRoute(
  {
    route: '/api/contacts/:id/messages/:messageId/retry',
    access: 'cookie',
    params: retryMessageParamsSchema,
  },
  async ({ params, ctx }) => {
    const r = await retryMessage(
      { contactId: asContactId(params.id), messageId: asMessageId(params.messageId) },
      ctx,
    );
    if (!r.ok) return r;
    return json(toMessageDto(r.value));
  },
);
