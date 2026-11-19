import {
  bodyStream,
  json,
  parseByteRange,
  serveLocalMedia,
  sliceStream,
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
  async ({ params, ctx, request }) => {
    const r = await serveLocalMedia({ key: toLocalStorageKey(params.key) }, ctx);
    if (!r.ok) return r;
    const { stream, contentType, sizeBytes } = r.value;
    const base = {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    // Seeking in audio and video asks for byte ranges (Blob storage serves them itself).
    const range = parseByteRange(request.headers.get('range'), sizeBytes);
    if (range === 'unsatisfiable') {
      await stream.cancel().catch(() => undefined);
      return new Response(null, {
        status: 416,
        headers: { ...base, 'Content-Range': `bytes */${String(sizeBytes)}` },
      });
    }
    if (range === null) {
      return new Response(stream, {
        headers: { ...base, 'Content-Length': String(sizeBytes) },
      });
    }
    return new Response(sliceStream(stream, range.start, range.end), {
      status: 206,
      headers: {
        ...base,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${String(range.start)}-${String(range.end)}/${String(sizeBytes)}`,
      },
    });
  },
);
