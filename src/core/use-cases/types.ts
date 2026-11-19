import type { ErrorCode, PriceTable, Result } from '@/core/domain';
import type {
  AccessTokenSigner,
  CannedReplyRepository,
  ChatModel,
  Clock,
  ContactRepository,
  ContentHasher,
  DocumentExtractor,
  FileStorage,
  IdGenerator,
  KnowledgeRepository,
  KnowledgeSource,
  Logger,
  MessageRepository,
  MessagingGateway,
  RateLimitRepository,
  SecretCipher,
  SettingsRepository,
  TopicGuard,
  UsageRepository,
  WebhookEventRepository,
} from '@/core/ports';

export interface RequestContext {
  requestId: string;
  /** Caller IP from the route (first x-forwarded-for on Vercel). null when unknown. */
  clientIp: string | null;
}

export type UseCase<I, O, C extends ErrorCode = never> = (
  input: I,
  ctx: RequestContext,
) => Promise<Result<O, C>>;

export interface UseCaseConfig {
  /** APP_BASE_URL */
  appBaseUrl: string;
  /** AI_DEBOUNCE_MS */
  aiDebounceMs: number;
  /** AI_STUCK_AFTER_MS */
  aiStuckAfterMs: number;
  /** POLL_INTERVAL_MS, passed on to the web app through GetSettings. */
  pollIntervalMs: number;
  /** RATE_LIMIT_SCALE */
  rateLimitScale: number;
  /** From pricing.constants.ts. */
  priceTable: PriceTable;
}

/** Every port, under the property name use cases use. A use case takes a Pick of this. */
export interface AllPorts {
  gateway: MessagingGateway;
  chatModel: ChatModel;
  extractor: DocumentExtractor;
  topicGuard: TopicGuard;
  knowledgeSource: KnowledgeSource;
  storage: FileStorage;
  contacts: ContactRepository;
  messages: MessageRepository;
  settings: SettingsRepository;
  knowledge: KnowledgeRepository;
  usage: UsageRepository;
  cannedReplies: CannedReplyRepository;
  webhookEvents: WebhookEventRepository;
  rateLimits: RateLimitRepository;
  cipher: SecretCipher;
  signer: AccessTokenSigner;
  hasher: ContentHasher;
  clock: Clock;
  ids: IdGenerator;
  logger: Logger;
}
