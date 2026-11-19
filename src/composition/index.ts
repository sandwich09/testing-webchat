import 'server-only';

import { after, type NextRequest, type NextResponse } from 'next/server';
import type { RequestContext } from '@/core/use-cases';
import { createContainer, type Container, type UseCases } from './container';
import { createNonce } from './csp';
import { getEnv } from './env';
import { makeJobs } from './jobs';
import { makeProxyGate } from './proxy-gate';
import { makeRunJob, makeWithRoute } from './route';
import { toUsageMonth } from './from-request';

// The only entry of src/composition for routes, proxy.ts and instrumentation.ts. It exports
// assembled use cases, the route wrapper and request/response helpers; never a repository or
// an adapter (project-setup 6.3). Nothing here reads the environment at import time, so
// `next build` can load route modules without the runtime variables.

let container: Container | null = null;

/** The process-wide container, built from the validated environment on first use. */
const getContainer = (): Container => (container ??= createContainer(getEnv()));

/** Forwards to the container's use case, so importing this module builds nothing. */
const forwardTo = <K extends keyof UseCases>(key: K): UseCases[K] => {
  type AnyFn = (...args: unknown[]) => unknown;
  const forward: AnyFn = (...args) => (getContainer().useCases[key] as AnyFn)(...args);
  // `forward` calls exactly UseCases[K] with the same arguments; TS cannot correlate the key.
  return forward as UseCases[K];
};

// ---------------------------------------------------------------------------
// Use cases (docs/architecture/use-cases.md)
// ---------------------------------------------------------------------------

export const verifyAccess = forwardTo('verifyAccess');
export const unlockAccess = forwardTo('unlockAccess');
export const checkHealth = forwardTo('checkHealth');
export const receiveLineEvents = forwardTo('receiveLineEvents');
/** After-response job: call through `scheduleLineFollowUps`, not from a route directly. */
export const storeInboundMedia = forwardTo('storeInboundMedia');
/** After-response job: call through `scheduleLineFollowUps`, not from a route directly. */
export const generateAiReply = forwardTo('generateAiReply');
export const sendAdminMessage = forwardTo('sendAdminMessage');
export const retryMessage = forwardTo('retryMessage');
export const issueUpload = forwardTo('issueUpload');
export const discardUpload = forwardTo('discardUpload');
/** Answers 404 `media.not_found` unless FILE_STORAGE is local. */
export const writeLocalUpload = forwardTo('writeLocalUpload');
/** Answers 404 `media.not_found` unless FILE_STORAGE is local. */
export const serveLocalMedia = forwardTo('serveLocalMedia');
export const showTypingToCustomer = forwardTo('showTypingToCustomer');
export const setContactAi = forwardTo('setContactAi');
export const markContactRead = forwardTo('markContactRead');
export const listContacts = forwardTo('listContacts');
export const getContact = forwardTo('getContact');
export const getMessages = forwardTo('getMessages');
export const getSettings = forwardTo('getSettings');
export const updateSettings = forwardTo('updateSettings');
export const testTopicGuard = forwardTo('testTopicGuard');
export const getGuardrailStats = forwardTo('getGuardrailStats');
export const setLineCredentials = forwardTo('setLineCredentials');
export const testLineConnection = forwardTo('testLineConnection');
/** Phase A. Hand `followUp` to `scheduleDocumentExtraction` after a success. */
export const ingestDocument = forwardTo('ingestDocument');
/** Phase B of IngestDocument: call through `scheduleDocumentExtraction`. */
export const extractDocument = forwardTo('extractDocument');
export const deleteDocument = forwardTo('deleteDocument');
export const listDocuments = forwardTo('listDocuments');
export const getDocument = forwardTo('getDocument');
export const getUsageReport = forwardTo('getUsageReport');
export const getContactUsage = forwardTo('getContactUsage');
export const getSystemStatus = forwardTo('getSystemStatus');

// ---------------------------------------------------------------------------
// Route wrapper, jobs, proxy and start-up check
// ---------------------------------------------------------------------------

/** The route wrapper. See the usage note at the top of app/api/_lib/with-route.ts. */
export const withRoute = makeWithRoute(() => {
  const c = getContainer();
  return {
    verifyAccess: c.useCases.verifyAccess,
    ids: c.ports.ids,
    logger: c.ports.logger,
    appOrigin: c.env.appOrigin,
  };
});

/** Runs a job after the response through Next.js `after()`, logging `job.run.failed` on a throw. */
export const runJob = makeRunJob({ schedule: after, logger: () => getContainer().ports.logger });

const jobs = makeJobs(() => {
  const c = getContainer();
  return {
    runJob,
    storeInboundMedia: c.useCases.storeInboundMedia,
    generateAiReply: c.useCases.generateAiReply,
    extractDocument: c.useCases.extractDocument,
  };
});

/** Webhook: runs every follow-up of ReceiveLineEvents after the 200. */
export const scheduleLineFollowUps = jobs.scheduleLineFollowUps;
/** Knowledge upload and retry: runs phase B after the 202. */
export const scheduleDocumentExtraction = jobs.scheduleDocumentExtraction;

/** `month` query of the usage endpoints, defaulting to the current month in Bangkok time. */
export const usageMonth = (month: string | undefined): string =>
  toUsageMonth(month, getContainer().ports.clock.now());

let gate: ((request: NextRequest) => Promise<NextResponse>) | null = null;

/** The whole of proxy.ts: cookie gate, origin check and CSP nonce. */
export const proxyGate = (request: NextRequest): Promise<NextResponse> => {
  gate ??= (() => {
    const c = getContainer();
    return makeProxyGate({
      verifyAccess: c.useCases.verifyAccess,
      ids: c.ports.ids,
      logger: c.ports.logger,
      appOrigin: c.env.appOrigin,
      development: c.env.isDevelopment,
      nonce: createNonce,
    });
  })();
  return gate(request);
};

export { assertEnv, assertEnvOrExit } from './env';

// ---------------------------------------------------------------------------
// Request and response helpers for routes
// ---------------------------------------------------------------------------

export { ERROR_HTTP, WEBHOOK_STATUS_OVERRIDES, type HttpErrorCode } from './http-errors';
export {
  ACCESS_COOKIE_NAME,
  accessClearedResponse,
  accessGrantedResponse,
  errorResponse,
  fail,
  json,
  noContent,
  type RouteFailure,
} from './http-response';
export {
  PDF_UPLOAD_MAX_BODY_BYTES,
  bodyStream,
  clientIpOf,
  decodeContactCursor,
  encodeContactCursor,
  parseJsonBody,
  parseParams,
  parseQuery,
  readPdfUpload,
  readWebhookBody,
} from './http-request';
export {
  asContactId,
  asDocumentId,
  asMessageId,
  asUploadId,
  toGetMessagesInput,
  toListContactsInput,
  toLocalStorageKey,
  toSendAdminMessageInput,
  toSetLineCredentialsInput,
  toUpdateSettingsInput,
} from './from-request';
export * from './to-dto';
export type { NextRouteHandler, RouteAccess, RouteArgs, RouteOptions, RouteOutcome } from './route';
export type { RequestContext };
