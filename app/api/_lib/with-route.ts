/**
 * How to write a route (one `route.ts` per path of docs/architecture/api-contract.md).
 *
 * Import only from '@/composition' and '@/contracts'. Every method is `withRoute(options, handler)`:
 *
 * - `route`: the template for logs, e.g. '/api/contacts/:id/messages' (never the real path).
 * - `access`: 'cookie' for every endpoint that needs the access cookie; 'open' for
 *   GET /api/health, POST /api/access/unlock and both /api/local-storage/*key methods;
 *   'webhook' for POST /api/line/webhook only. Origin is checked for every non-GET except the
 *   webhook, by withRoute itself.
 * - `params`, `query`, `body`: contract schemas. A failure answers 400 request.invalid (a JSON
 *   body over JSON_MAX_BODY_BYTES answers 413 request.too_large) before the handler runs.
 *
 * The handler gets `{ request, ctx, params, query, body }` and returns a `Response` (`json`,
 * `noContent`, ...) or a failure: a failed use case `Result` is returned as is (`if (!r.ok)
 * return r;`), or `fail(code)`. withRoute turns failures into the error body with the status of
 * the error catalog (and Retry-After on 429), adds `Cache-Control: no-store` and `x-request-id`,
 * logs `http.request.completed`, and turns a throw into 500 internal.unexpected. Routes never
 * call the Logger, never build error bodies and never call a port.
 *
 * ```ts
 * // app/api/contacts/[id]/messages/route.ts
 * import {
 *   getMessages, sendAdminMessage, toGetMessagesInput, toGetMessagesResponse, toMessageDto,
 *   toSendAdminMessageInput, json, withRoute,
 * } from '@/composition';
 * import { getMessagesQuerySchema, messagesParamsSchema, sendMessageBodySchema } from '@/contracts';
 *
 * export const runtime = 'nodejs';
 * export const dynamic = 'force-dynamic';
 *
 * const route = '/api/contacts/:id/messages';
 *
 * export const GET = withRoute(
 *   { route, access: 'cookie', params: messagesParamsSchema, query: getMessagesQuerySchema },
 *   async ({ params, query, ctx }) => {
 *     const r = await getMessages(toGetMessagesInput(params.id, query), ctx);
 *     if (!r.ok) return r;
 *     return json(toGetMessagesResponse(r.value));
 *   },
 * );
 *
 * export const POST = withRoute(
 *   { route, access: 'cookie', params: messagesParamsSchema, body: sendMessageBodySchema },
 *   async ({ params, body, ctx }) => {
 *     const r = await sendAdminMessage(toSendAdminMessageInput(params.id, body), ctx);
 *     if (!r.ok) return r;
 *     return json(toMessageDto(r.value));
 *   },
 * );
 * ```
 *
 * Special cases:
 *
 * - Webhook: `const raw = await readWebhookBody(request); if (!raw.ok) return raw;` then
 *   `receiveLineEvents({ rawBody: raw.value, signature: request.headers.get('x-line-signature') }, ctx)`,
 *   `scheduleLineFollowUps(r.value.followUps, ctx)` and `json({})`. Also export
 *   `maxDuration = 300 // WEBHOOK_MAX_DURATION_S`.
 * - PDF upload and retry: `const file = await readPdfUpload(request); if (!file.ok) return file;`,
 *   `ingestDocument({ ...file.value, retryOf: null | asDocumentId(params.id) }, ctx)`, then
 *   `scheduleDocumentExtraction(r.value.followUp, ctx, route)` and
 *   `json(toDocumentDto(r.value.document), 202)`. Export `maxDuration = 300 // KNOWLEDGE_MAX_DURATION_S`.
 * - Unlock: `access: 'open'`, `body: unlockBodySchema`, then
 *   `accessGrantedResponse(r.value.token)`. Lock: `access: 'cookie'`, `accessClearedResponse()`.
 * - Local storage: `writeLocalUpload` / `serveLocalMedia` already answer 404 media.not_found
 *   unless FILE_STORAGE is local. Key: `toLocalStorageKey(params.key)`; PUT body:
 *   `bodyStream(request)` with `request.headers.get('content-type') ?? ''`. GET answers
 *   `new Response(r.value.stream, { headers: { 'Content-Type': ..., 'Content-Length': ...,
 *   'X-Content-Type-Options': 'nosniff' } })`.
 * - GET /api/contacts: `const input = toListContactsInput(query); if (!input.ok) return input;`
 *   (decodes the opaque `before` cursor); answer with `toListContactsResponse`, which encodes it.
 * - PATCH /api/settings: `toUpdateSettingsInput(body)` returns a Result too.
 * - Usage: `month: usageMonth(query.month)`.
 * - Empty-body POSTs (read, typing, retry, line/test, lock) declare no `body` schema.
 * - Path ids: `asContactId`, `asMessageId`, `asDocumentId`, `asCannedReplyId`, `asUploadId`.
 */
export {
  accessClearedResponse,
  accessGrantedResponse,
  bodyStream,
  fail,
  json,
  noContent,
  readPdfUpload,
  readWebhookBody,
  runJob,
  scheduleDocumentExtraction,
  scheduleLineFollowUps,
  withRoute,
} from '@/composition';
export type {
  NextRouteHandler,
  RouteAccess,
  RouteArgs,
  RouteOptions,
  RouteOutcome,
} from '@/composition';
