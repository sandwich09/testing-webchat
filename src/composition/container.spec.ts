import { describe, expect, it } from 'vitest';
import { AI_STUCK_AFTER_MS, PRICE_TABLE, type StorageKey } from '@/core/domain';
import type { AllPorts } from '@/core/use-cases';
import {
  FakeAccessTokenSigner,
  FakeCannedReplyRepository,
  FakeChatModel,
  FakeClock,
  FakeContactRepository,
  FakeContentHasher,
  FakeDocumentExtractor,
  FakeFileStorage,
  FakeIdGenerator,
  FakeKnowledgeRepository,
  FakeKnowledgeSource,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeRateLimitRepository,
  FakeSecretCipher,
  FakeSettingsRepository,
  FakeTopicGuard,
  FakeUsageRepository,
  FakeWebhookEventRepository,
} from '@/adapters/fakes';
import {
  assembleUseCases,
  configFromEnv,
  createContainer,
  lazyPorts,
  realPortFactories,
} from './container';
import { parseEnv, type AppEnv } from './env';

const ctx = { requestId: 'req-1', clientIp: null };

const env = (over: Record<string, string> = {}): AppEnv => {
  const r = parseEnv({
    DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none',
    ACCESS_CODE: 'code-for-tests',
    SESSION_SECRET: Buffer.alloc(32, 1).toString('base64'),
    CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    ANTHROPIC_API_KEY: 'fake',
    FILE_STORAGE: 'local',
    APP_BASE_URL: 'http://localhost:3000',
    RATE_LIMIT_SCALE: '10',
    AI_DEBOUNCE_MS: '300',
    POLL_INTERVAL_MS: '500',
    ...over,
  });
  if (!r.ok) throw new Error(r.invalid.join(','));
  return r.env;
};

type Factories = Parameters<typeof lazyPorts>[0];

const fakeFactories = (): Factories => {
  const clock = new FakeClock();
  const contacts = new FakeContactRepository();
  return {
    clock: () => clock,
    ids: () => new FakeIdGenerator(clock),
    logger: () => new FakeLogger(clock),
    cipher: () => new FakeSecretCipher(),
    signer: () => new FakeAccessTokenSigner(),
    hasher: () => new FakeContentHasher(),
    gateway: () => new FakeMessagingGateway(),
    chatModel: () => new FakeChatModel(),
    extractor: () => new FakeDocumentExtractor(),
    topicGuard: () => new FakeTopicGuard(),
    knowledgeSource: () => new FakeKnowledgeSource(),
    storage: () => new FakeFileStorage(),
    contacts: () => contacts,
    messages: () => new FakeMessageRepository({ contacts }),
    settings: () => new FakeSettingsRepository(),
    knowledge: () => new FakeKnowledgeRepository(),
    usage: () => new FakeUsageRepository({ contacts }),
    cannedReplies: () => new FakeCannedReplyRepository(),
    webhookEvents: () => new FakeWebhookEventRepository(),
    rateLimits: () => new FakeRateLimitRepository(),
  };
};

/** Ports whose every read throws: proves that assembling touches none of them. */
const explodingPorts = (): AllPorts =>
  new Proxy({} as AllPorts, {
    get: (_t, key) => {
      throw new Error(`port ${String(key)} was read`);
    },
  });

describe('configFromEnv', () => {
  it('passes the environment values and fixed constants into UseCaseConfig', () => {
    expect(configFromEnv(env())).toEqual({
      appBaseUrl: 'http://localhost:3000',
      aiDebounceMs: 300,
      aiStuckAfterMs: AI_STUCK_AFTER_MS,
      pollIntervalMs: 500,
      rateLimitScale: 10,
      priceTable: PRICE_TABLE,
    });
  });
});

describe('lazyPorts', () => {
  it('builds a port on first read only, then reuses it', () => {
    const built: string[] = [];
    const base = fakeFactories();
    const ports = lazyPorts({
      ...base,
      clock: (p) => {
        built.push('clock');
        return base.clock(p);
      },
      settings: (p) => {
        built.push('settings');
        // A port may read another port while it is built.
        p.clock.now();
        return base.settings(p);
      },
    });
    expect(built).toEqual([]);
    const s = ports.settings;
    expect(ports.settings).toBe(s);
    expect(built).toEqual(['settings', 'clock']);
    expect(ports.clock).toBe(ports.clock);
    expect(built).toEqual(['settings', 'clock']);
  });
});

describe('assembleUseCases', () => {
  const NAMES = [
    'verifyAccess',
    'unlockAccess',
    'checkHealth',
    'receiveLineEvents',
    'storeInboundMedia',
    'generateAiReply',
    'sendAdminMessage',
    'retryMessage',
    'issueUpload',
    'discardUpload',
    'writeLocalUpload',
    'serveLocalMedia',
    'showTypingToCustomer',
    'setContactAi',
    'markContactRead',
    'listContacts',
    'getContact',
    'getMessages',
    'getSettings',
    'updateSettings',
    'testTopicGuard',
    'getGuardrailStats',
    'setLineCredentials',
    'testLineConnection',
    'ingestDocument',
    'extractDocument',
    'deleteDocument',
    'listDocuments',
    'getDocument',
    'saveCannedReply',
    'deleteCannedReply',
    'listCannedReplies',
    'getUsageReport',
    'getContactUsage',
    'getSystemStatus',
  ];

  it('exposes every use case, TestTopicGuard and GetGuardrailStats included, without touching ports', () => {
    const useCases = assembleUseCases(explodingPorts(), configFromEnv(env()), {
      localStorage: true,
    });
    expect(Object.keys(useCases).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES)
      expect(typeof useCases[name as keyof typeof useCases]).toBe('function');
  });

  it('runs a use case on the given ports', async () => {
    const ports = lazyPorts(fakeFactories());
    const useCases = assembleUseCases(ports, configFromEnv(env()), { localStorage: true });
    const { token } = ports.signer.issue(ports.clock.now());
    expect(await useCases.verifyAccess({ token }, ctx)).toEqual({ ok: true, value: undefined });
    expect(await useCases.verifyAccess({ token: null }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'access.unauthorized' },
    });
    expect(await useCases.listCannedReplies({}, ctx)).toEqual({ ok: true, value: [] });
  });

  it('answers media.not_found for both local storage use cases unless FILE_STORAGE is local', async () => {
    const useCases = assembleUseCases(explodingPorts(), configFromEnv(env()), {
      localStorage: false,
    });
    expect(await useCases.serveLocalMedia({ key: 'out/a/original.jpg' }, ctx)).toMatchObject({
      ok: false,
      error: { code: 'media.not_found' },
    });
    expect(
      await useCases.writeLocalUpload(
        { key: 'k', exp: '1', sig: 's', contentType: 'image/jpeg', body: new Blob([]).stream() },
        ctx,
      ),
    ).toMatchObject({ ok: false, error: { code: 'media.not_found' } });
  });

  it('serves local media when FILE_STORAGE is local', async () => {
    const factories = fakeFactories();
    const storage = new FakeFileStorage();
    const ports = lazyPorts({ ...factories, storage: () => storage });
    await storage.put(
      'outbound/abcdefghijklmnopqrstuv/original.jpg' as StorageKey,
      new Blob([new Uint8Array([1, 2])]).stream(),
      {
        contentType: 'image/jpeg',
        maxSizeBytes: 10,
      },
    );
    const useCases = assembleUseCases(ports, configFromEnv(env()), { localStorage: true });
    const r = await useCases.serveLocalMedia(
      { key: 'outbound/abcdefghijklmnopqrstuv/original.jpg' },
      ctx,
    );
    expect(r.ok && r.value.sizeBytes).toBe(2);
  });
});

describe('realPortFactories', () => {
  it('builds the system, LINE, Claude and storage adapters without any I/O', () => {
    const ports = lazyPorts(realPortFactories(env()));
    expect(ports.clock.now()).toBeInstanceOf(Date);
    expect(ports.ids.requestId()).toMatch(/^[0-9a-f-]{36}$/);
    const { token } = ports.signer.issue(ports.clock.now());
    expect(ports.signer.verify(token, ports.clock.now())).toBe(true);
    expect(ports.signer.checkCode('code-for-tests')).toBe(true);
    expect(ports.hasher.keyedHash('1.2.3.4')).not.toContain('1.2.3.4');
    for (const key of [
      'cipher',
      'gateway',
      'chatModel',
      'extractor',
      'topicGuard',
      'storage',
    ] as const) {
      expect(ports[key]).toBeTruthy();
    }
  });

  it('signs local uploads with a key derived from SESSION_SECRET, not the secret itself', async () => {
    const e = env();
    const ports = lazyPorts(realPortFactories(e));
    const target = await ports.storage.issueUpload({
      key: 'out/abc/original.jpg' as StorageKey,
      contentType: 'image/jpeg',
      maxSizeBytes: 100,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(target.ok && target.value.strategy).toBe('http_put');
    if (!target.ok || target.value.strategy !== 'http_put') return;
    expect(
      target.value.url.startsWith('http://localhost:3000/api/local-storage/out/abc/original.jpg?'),
    ).toBe(true);
    expect(target.value.url).not.toContain(encodeURIComponent(e.sessionSecret));
  });

  it('uses Vercel Blob when FILE_STORAGE is blob', async () => {
    const ports = lazyPorts(
      realPortFactories(env({ FILE_STORAGE: 'blob', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x_y' })),
    );
    const read = await ports.storage.read('out/a/original.jpg' as StorageKey);
    // Only the local disk serves reads; the Blob adapter refuses without calling the network.
    expect(read.ok).toBe(false);
  });
});

describe('createContainer', () => {
  it('wires env, lazy ports and use cases together', async () => {
    const c = createContainer(env(), fakeFactories());
    expect(c.env.appOrigin).toBe('http://localhost:3000');
    const { token } = c.ports.signer.issue(c.ports.clock.now());
    expect((await c.useCases.verifyAccess({ token }, ctx)).ok).toBe(true);
  });
});
