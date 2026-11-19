import {
  asDocumentId,
  deleteDocument,
  getDocument,
  json,
  noContent,
  toDocumentDetailDto,
  withRoute,
} from '@/composition';
import { documentParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/knowledge/documents/:id';

export const GET = withRoute(
  { route, access: 'cookie', params: documentParamsSchema },
  async ({ params, ctx }) => {
    const r = await getDocument({ documentId: asDocumentId(params.id) }, ctx);
    if (!r.ok) return r;
    return json(toDocumentDetailDto(r.value));
  },
);

export const DELETE = withRoute(
  { route, access: 'cookie', params: documentParamsSchema },
  async ({ params, ctx }) => {
    const r = await deleteDocument({ documentId: asDocumentId(params.id) }, ctx);
    if (!r.ok) return r;
    return noContent();
  },
);
