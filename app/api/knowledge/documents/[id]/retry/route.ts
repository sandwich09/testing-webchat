import {
  asDocumentId,
  ingestDocument,
  json,
  readPdfUpload,
  scheduleDocumentExtraction,
  toDocumentDto,
  withRoute,
} from '@/composition';
import { documentParamsSchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // KNOWLEDGE_MAX_DURATION_S

const route = '/api/knowledge/documents/:id/retry';

export const POST = withRoute(
  { route, access: 'cookie', params: documentParamsSchema },
  async ({ request, params, ctx }) => {
    const file = await readPdfUpload(request);
    if (!file.ok) return file;
    const r = await ingestDocument({ ...file.value, retryOf: asDocumentId(params.id) }, ctx);
    if (!r.ok) return r;
    scheduleDocumentExtraction(r.value.followUp, ctx, route);
    return json(toDocumentDto(r.value.document), 202);
  },
);
