import {
  bodyStream,
  json,
  serveLocalMedia,
  toLocalStorageKey,
  withRoute,
  writeLocalUpload,
} from '@/composition';
import { localStorageParamsSchema, writeLocalUploadQuerySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/local-storage/*key';

// Both methods answer 404 media.not_found unless FILE_STORAGE is local (the use cases decide).
export const PUT = withRoute(
  {
    route,
    access: 'open',
    params: localStorageParamsSchema,
    query: writeLocalUploadQuerySchema,
  },
  async ({ request, params, query, ctx }) => {
    const r = await writeLocalUpload(
      {
        key: toLocalStorageKey(params.key),
        exp: query.exp,
        sig: query.sig,
        contentType: request.headers.get('content-type') ?? '',
        body: bodyStream(request),
      },
      ctx,
    );
    if (!r.ok) return r;
    return json({});
  },
);

export const GET = withRoute(
  { route, access: 'open', params: localStorageParamsSchema },
  async ({ params, ctx }) => {
    const r = await serveLocalMedia({ key: toLocalStorageKey(params.key) }, ctx);
    if (!r.ok) return r;
    return new Response(r.value.stream, {
      headers: {
        'Content-Type': r.value.contentType,
        'Content-Length': String(r.value.sizeBytes),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
);
