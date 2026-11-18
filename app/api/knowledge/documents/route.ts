import {
  ingestDocument,
  json,
  listDocuments,
  readPdfUpload,
  scheduleDocumentExtraction,
  toDocumentDto,
  toListDocumentsResponse,
  withRoute,
} from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // KNOWLEDGE_MAX_DURATION_S

const route = '/api/knowledge/documents';

export const GET = withRoute({ route, access: 'cookie' }, async ({ ctx }) => {
  const r = await listDocuments({}, ctx);
  if (!r.ok) return r;
  return json(toListDocumentsResponse(r.value));
});

export const POST = withRoute({ route, access: 'cookie' }, async ({ request, ctx }) => {
  const file = await readPdfUpload(request);
  if (!file.ok) return file;
  const r = await ingestDocument({ ...file.value, retryOf: null }, ctx);
  if (!r.ok) return r;
  scheduleDocumentExtraction(r.value.followUp, ctx, route);
  return json(toDocumentDto(r.value.document), 202);
});
