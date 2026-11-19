import { hkdfSync } from 'node:crypto';
import { join } from 'node:path';
import { AI_STUCK_AFTER_MS, PRICE_TABLE } from '@/core/domain';
import {
  createClaudeChatModel,
  createClaudeDocumentExtractor,
  createClaudeTopicGuard,
} from '@/adapters/claude';
import { createLineMessagingGateway } from '@/adapters/line';
import { createLocalFileStorage } from '@/adapters/local-storage';
import { createVercelBlobStorage } from '@/adapters/blob';
import {
  createContactNoteRepository,
  createContactRepository,
  createKnowledgeRepository,
  createKnowledgeSource,
  createMessageRepository,
  createRateLimitRepository,
  createSettingsRepository,
  createUsageRepository,
  createWebhookEventRepository,
  getPrismaClient,
} from '@/adapters/prisma';
import {
  createAesGcmCipher,
  createHmacAccessTokenSigner,
  createJsonLogger,
  createSha256ContentHasher,
  createSystemClock,
  createUuidV7IdGenerator,
} from '@/adapters/system';
import {
  makeCheckHealth,
  makeDeleteDocument,
  makeDiscardUpload,
  makeExtractDocument,
  makeGenerateAiReply,
  makeGetContact,
  makeGetContactUsage,
  makeGetDocument,
  makeGetGuardrailStats,
  makeGetMessages,
  makeGetSettings,
  makeGetSystemStatus,
  makeGetUsageReport,
  makeIngestDocument,
  makeIssueUpload,
  makeListContacts,
  makeListDocuments,
  makeMarkContactRead,
  makeAddContactNote,
  makeDeleteContactNote,
  makeHandleRichMenuAction,
  makePublishRichMenu,
  makeRemoveRichMenu,
  makeSendWelcome,
  makeRefreshContactProfile,
  makeListContactNotes,
  makeReceiveLineEvents,
  makeRetryMessage,
  makeSendAdminMessage,
  makeServeLocalMedia,
  makeSetContactAi,
  makeSetLineCredentials,
  makeShowTypingToCustomer,
  makeStoreInboundMedia,
  makeTestLineConnection,
  makeTestTopicGuard,
  makeUnlockAccess,
  makeUpdateSettings,
  makeVerifyAccess,
  makeWriteLocalUpload,
  type AllPorts,
  type UseCaseConfig,
} from '@/core/use-cases';
import { err } from '@/core/domain';
import type { AppEnv } from './env';

/** Files of FILE_STORAGE=local live here; in Docker this is /app/.data/uploads (project-setup 6.10). */
const LOCAL_UPLOADS_DIR = join('.data', 'uploads');
/**
 * The signed-PUT key of the local disk is derived from SESSION_SECRET with its own label, so it
 * never equals the cookie key or the rate-limit HMAC key made from the same secret.
 */
const LOCAL_STORAGE_HKDF_SALT = 'twa.local-storage';
const LOCAL_STORAGE_HKDF_INFO = 'signed-put.v1';

export const configFromEnv = (env: AppEnv): UseCaseConfig => ({
  appBaseUrl: env.appBaseUrl,
  aiDebounceMs: env.aiDebounceMs,
  aiStuckAfterMs: AI_STUCK_AFTER_MS,
  pollIntervalMs: env.pollIntervalMs,
  rateLimitScale: env.rateLimitScale,
  priceTable: PRICE_TABLE,
});

const localStorageSecret = (sessionSecret: string): string =>
  Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(sessionSecret, 'utf8'),
      LOCAL_STORAGE_HKDF_SALT,
      LOCAL_STORAGE_HKDF_INFO,
      32,
    ),
  ).toString('base64url');

type PortFactories = { [K in keyof AllPorts]: (ports: AllPorts) => AllPorts[K] };

/**
 * Real adapters, each built on first use and then reused. Nothing connects or reads a file
 * until a use case actually needs that port.
 */
export const realPortFactories = (env: AppEnv): PortFactories => {
  const claude = { apiKey: env.anthropicApiKey, baseURL: env.anthropicBaseUrl };
  const prisma = () => getPrismaClient(env.databaseUrl);
  return {
    clock: () => createSystemClock(),
    ids: () => createUuidV7IdGenerator(),
    logger: () => createJsonLogger(),
    cipher: () => createAesGcmCipher({ key: env.credentialsEncryptionKey }),
    signer: () =>
      createHmacAccessTokenSigner({ accessCode: env.accessCode, sessionSecret: env.sessionSecret }),
    hasher: () => createSha256ContentHasher({ sessionSecret: env.sessionSecret }),
    gateway: () =>
      createLineMessagingGateway({
        apiBaseUrl: env.lineApiBaseUrl,
        dataApiBaseUrl: env.lineDataApiBaseUrl,
      }),
    chatModel: () => createClaudeChatModel(claude),
    extractor: () => createClaudeDocumentExtractor(claude),
    topicGuard: () => createClaudeTopicGuard(claude),
    storage: (ports) =>
      env.fileStorage.kind === 'local'
        ? createLocalFileStorage({
            rootDir: join(process.cwd(), LOCAL_UPLOADS_DIR),
            baseUrl: env.appBaseUrl,
            secret: localStorageSecret(env.sessionSecret),
            clock: ports.clock,
          })
        : createVercelBlobStorage({ token: env.fileStorage.token }),
    contacts: () => createContactRepository(prisma()),
    notes: () => createContactNoteRepository(prisma()),
    messages: () => createMessageRepository(prisma()),
    settings: (ports) => createSettingsRepository(prisma(), { clock: ports.clock }),
    knowledge: () => createKnowledgeRepository(prisma()),
    usage: () => createUsageRepository(prisma()),
    webhookEvents: () => createWebhookEventRepository(prisma()),
    rateLimits: () => createRateLimitRepository(prisma()),
    knowledgeSource: () => createKnowledgeSource(prisma()),
  };
};

/** An AllPorts whose properties are built by the factories on first read, then cached. */
export const lazyPorts = (factories: PortFactories): AllPorts => {
  const ports = {} as AllPorts; // filled with getters below, one per key of PortFactories
  const cache = new Map<keyof AllPorts, unknown>();
  for (const key of Object.keys(factories) as (keyof AllPorts)[]) {
    Object.defineProperty(ports, key, {
      enumerable: true,
      get: () => {
        if (!cache.has(key)) cache.set(key, factories[key](ports));
        return cache.get(key);
      },
    });
  }
  return ports;
};

/** Memoizes a factory: the use case is assembled on its first call only. */
const once = <T>(build: () => T): (() => T) => {
  let built: { value: T } | null = null;
  return () => (built ??= { value: build() }).value;
};

/** Every use case, assembled from the given ports. Each is built on first call. */
export const assembleUseCases = (
  ports: AllPorts,
  config: UseCaseConfig,
  options: { localStorage: boolean },
) => {
  const lazy = <F extends (...args: never[]) => unknown>(build: () => F): F => {
    const get = once(build);
    // Forwarding wrapper with the same signature as F.
    return ((...args: Parameters<F>) => get()(...args)) as F;
  };

  const writeLocalUploadCore = lazy(() => makeWriteLocalUpload(ports, config));
  const serveLocalMediaCore = lazy(() => makeServeLocalMedia(ports, config));

  return {
    verifyAccess: lazy(() => makeVerifyAccess(ports, config)),
    unlockAccess: lazy(() => makeUnlockAccess(ports, config)),
    checkHealth: lazy(() => makeCheckHealth(ports, config)),
    receiveLineEvents: lazy(() => makeReceiveLineEvents(ports, config)),
    storeInboundMedia: lazy(() => makeStoreInboundMedia(ports, config)),
    generateAiReply: lazy(() => makeGenerateAiReply(ports, config)),
    sendAdminMessage: lazy(() => makeSendAdminMessage(ports, config)),
    retryMessage: lazy(() => makeRetryMessage(ports, config)),
    issueUpload: lazy(() => makeIssueUpload(ports, config)),
    discardUpload: lazy(() => makeDiscardUpload(ports, config)),
    /** 404 `media.not_found` unless FILE_STORAGE is local (api-contract "มีเมื่อ"). */
    writeLocalUpload: async (...args: Parameters<typeof writeLocalUploadCore>) =>
      options.localStorage ? writeLocalUploadCore(...args) : err('media.not_found'),
    /** 404 `media.not_found` unless FILE_STORAGE is local. */
    serveLocalMedia: async (...args: Parameters<typeof serveLocalMediaCore>) =>
      options.localStorage ? serveLocalMediaCore(...args) : err('media.not_found'),
    showTypingToCustomer: lazy(() => makeShowTypingToCustomer(ports, config)),
    setContactAi: lazy(() => makeSetContactAi(ports, config)),
    markContactRead: lazy(() => makeMarkContactRead(ports, config)),
    listContactNotes: lazy(() => makeListContactNotes(ports, config)),
    addContactNote: lazy(() => makeAddContactNote(ports, config)),
    deleteContactNote: lazy(() => makeDeleteContactNote(ports, config)),
    handleRichMenuAction: lazy(() => makeHandleRichMenuAction(ports, config)),
    sendWelcome: lazy(() => makeSendWelcome(ports, config)),
    refreshContactProfile: lazy(() => makeRefreshContactProfile(ports, config)),
    publishRichMenu: lazy(() => makePublishRichMenu(ports, config)),
    removeRichMenu: lazy(() => makeRemoveRichMenu(ports, config)),
    listContacts: lazy(() => makeListContacts(ports, config)),
    getContact: lazy(() => makeGetContact(ports, config)),
    getMessages: lazy(() => makeGetMessages(ports, config)),
    getSettings: lazy(() => makeGetSettings(ports, config)),
    updateSettings: lazy(() => makeUpdateSettings(ports, config)),
    testTopicGuard: lazy(() => makeTestTopicGuard(ports, config)),
    getGuardrailStats: lazy(() => makeGetGuardrailStats(ports, config)),
    setLineCredentials: lazy(() => makeSetLineCredentials(ports, config)),
    testLineConnection: lazy(() => makeTestLineConnection(ports, config)),
    ingestDocument: lazy(() => makeIngestDocument(ports, config)),
    extractDocument: lazy(() => makeExtractDocument(ports, config)),
    deleteDocument: lazy(() => makeDeleteDocument(ports, config)),
    listDocuments: lazy(() => makeListDocuments(ports, config)),
    getDocument: lazy(() => makeGetDocument(ports, config)),
    getUsageReport: lazy(() => makeGetUsageReport(ports, config)),
    getContactUsage: lazy(() => makeGetContactUsage(ports, config)),
    getSystemStatus: lazy(() => makeGetSystemStatus(ports, config)),
  };
};

export type UseCases = ReturnType<typeof assembleUseCases>;

export interface Container {
  env: AppEnv;
  ports: AllPorts;
  useCases: UseCases;
}

export const createContainer = (env: AppEnv, factories = realPortFactories(env)): Container => {
  const ports = lazyPorts(factories);
  return {
    env,
    ports,
    useCases: assembleUseCases(ports, configFromEnv(env), {
      localStorage: env.fileStorage.kind === 'local',
    }),
  };
};
