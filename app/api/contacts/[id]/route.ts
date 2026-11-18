import {
  asContactId,
  getContact,
  json,
  setContactAi,
  toContactDetailDto,
  toContactDto,
  withRoute,
} from '@/composition';
import { contactParamsSchema, setContactAiBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/contacts/:id';

export const GET = withRoute(
  { route, access: 'cookie', params: contactParamsSchema },
  async ({ params, ctx }) => {
    const r = await getContact({ contactId: asContactId(params.id) }, ctx);
    if (!r.ok) return r;
    return json(toContactDetailDto(r.value));
  },
);

export const PATCH = withRoute(
  { route, access: 'cookie', params: contactParamsSchema, body: setContactAiBodySchema },
  async ({ params, body, ctx }) => {
    const r = await setContactAi(
      { contactId: asContactId(params.id), aiEnabled: body.aiEnabled },
      ctx,
    );
    if (!r.ok) return r;
    return json(toContactDto(r.value));
  },
);
