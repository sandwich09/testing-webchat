import {
  getMessages,
  json,
  sendAdminMessage,
  toGetMessagesInput,
  toGetMessagesResponse,
  toMessageDto,
  toSendAdminMessageInput,
  withRoute,
} from '@/composition';
import { getMessagesQuerySchema, messagesParamsSchema, sendMessageBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/contacts/:id/messages';

export const GET = withRoute(
  { route, access: 'cookie', params: messagesParamsSchema, query: getMessagesQuerySchema },
  async ({ params, query, ctx }) => {
    const r = await getMessages(toGetMessagesInput(params.id, query), ctx);
    if (!r.ok) return r;
    return json(toGetMessagesResponse(r.value));
  },
);

export const POST = withRoute(
  { route, access: 'cookie', params: messagesParamsSchema, body: sendMessageBodySchema },
  async ({ params, body, ctx }) => {
    const r = await sendAdminMessage(toSendAdminMessageInput(params.id, body), ctx);
    if (!r.ok) return r;
    return json(toMessageDto(r.value));
  },
);
