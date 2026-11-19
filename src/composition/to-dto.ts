import type {
  AiUsageRecord,
  Contact,
  ErrorCode,
  KbDocument,
  KbDocumentWithText,
  Message,
  NanoUsd,
  TokenUsage,
} from '@/core/domain';
import { formatUsd, lineSecretStatus, retryKeyExpiresAt } from '@/core/domain';
import type { UploadTarget, UsageByContactRow } from '@/core/ports';
import type {
  GetContactOutput,
  GetMessagesOutput,
  GetSettingsOutput,
  GetSystemStatusOutput,
  GuardrailStats,
  IssueUploadOutput,
  ListContactsOutput,
  ListDocumentsOutput,
  TestTopicGuardOutput,
  UsageReport,
} from '@/core/use-cases';
import type {
  ContactDetailDto,
  ContactDto,
  ContactUsageResponse,
  DocumentDetailDto,
  DocumentDto,
  GetMessagesResponse,
  GuardrailStatsDto,
  ListContactsResponse,
  ListDocumentsResponse,
  MessageDto,
  SettingsDto,
  SystemStatusDto,
  TestTopicGuardResponse,
  UploadTargetDto,
  UploadTicketDto,
  UsageRecordDto,
  UsageReportResponse,
  UsageRowDto,
} from '@/contracts';
import { encodeContactCursor } from './http-request';

// The one place that turns entities into the DTOs of api-contract "DTO ร่วม": dates as ISO
// strings, bigint sequences as decimal strings, money through formatUsd, null never omitted.

const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d === null ? null : d.toISOString());
const cost6 = (n: NanoUsd): string => formatUsd(n, 6);
const budget2 = (n: NanoUsd): string => formatUsd(n, 2);

/**
 * Image of a LINE sticker, built on the server so the screens never build URLs (api-contract).
 * The URL pattern is the public LINE sticker CDN; ต้องยืนยันรูปแบบ URL กับเอกสาร LINE.
 */
export const stickerImageUrl = (stickerId: string): string =>
  `https://stickershop.line-scdn.net/stickershop/v1/sticker/${encodeURIComponent(stickerId)}/android/sticker.png`;

// ---------------------------------------------------------------------------
// Contacts and messages
// ---------------------------------------------------------------------------

export const toContactDto = (c: Contact): ContactDto => ({
  id: c.id,
  displayName: c.displayName,
  pictureUrl: c.pictureUrl,
  followStatus: c.followStatus,
  followedAt: isoOrNull(c.followedAt),
  aiEnabled: c.aiEnabled,
  needsAdmin: c.needsAdmin,
  needsAdminReason: c.needsAdminReason,
  aiReplying: c.aiState === 'replying',
  unreadCount: c.unreadCount,
  lastMessage:
    c.lastMessageBy !== null && c.lastMessageType !== null
      ? {
          // The list's sort time: the latest inbound message, else when the contact was created.
          at: iso(c.lastMessageAt ?? c.createdAt),
          by: c.lastMessageBy,
          type: c.lastMessageType,
          text: c.lastMessagePreview,
        }
      : null,
  createdAt: iso(c.createdAt),
  updatedSeq: c.updatedSeq.toString(),
});

export const toContactDetailDto = ({ contact, stats }: GetContactOutput): ContactDetailDto => ({
  ...toContactDto(contact),
  stats: { messageCount: stats.messageCount, aiMessageCount: stats.aiMessageCount },
});

export const toMessageDto = (m: Message): MessageDto => {
  const isMedia = m.type === 'image' || m.type === 'video';
  const mediaStatus = m.mediaStatus ?? 'pending';
  return {
    id: m.id,
    seq: m.seq.toString(),
    updatedSeq: m.updatedSeq.toString(),
    contactId: m.contactId,
    direction: m.direction,
    author: m.author,
    type: m.type,
    text: m.text,
    media: isMedia
      ? {
          status: mediaStatus,
          // The file URL appears only once the file is stored (api-contract MessageDto.media).
          url: mediaStatus === 'ready' ? m.mediaUrl : null,
          previewUrl: m.previewUrl,
        }
      : null,
    sticker:
      m.type === 'sticker' && m.stickerPackageId !== null && m.stickerId !== null
        ? {
            packageId: m.stickerPackageId,
            stickerId: m.stickerId,
            imageUrl: stickerImageUrl(m.stickerId),
          }
        : null,
    otherKind: m.otherKind,
    eventCode: m.eventCode,
    // Null for inbound messages and event lines.
    delivery:
      m.direction === 'outbound'
        ? {
            status: m.deliveryStatus ?? 'pending',
            errorCode: m.deliveryError,
            retryExpiresAt: isoOrNull(retryKeyExpiresAt(m)),
          }
        : null,
    createdAt: iso(m.createdAt),
    sentAt: isoOrNull(m.sentAt),
  };
};

/** GET /api/contacts. `before` is the opaque cursor of the next page. */
export const toListContactsResponse = (o: ListContactsOutput): ListContactsResponse => ({
  contacts: o.contacts.map(toContactDto),
  before: o.next === null ? null : encodeContactCursor(o.next),
  hasMore: o.hasMore,
  highWater: o.highWater.toString(),
  counts: { all: o.counts.all, unread: o.counts.unread, needsAdmin: o.counts.needsAdmin },
  lineConfigured: o.lineConfigured,
});

export const toGetMessagesResponse = (o: GetMessagesOutput): GetMessagesResponse => ({
  messages: o.messages.map(toMessageDto),
  hasOlder: o.hasOlder,
  hasMore: o.hasMore,
  highWater: o.highWater.toString(),
});

// ---------------------------------------------------------------------------
// Settings and system
// ---------------------------------------------------------------------------

export const toSettingsDto = (o: GetSettingsOutput): SettingsDto => {
  const s = o.settings;
  return {
    ai: {
      enabled: s.aiEnabled,
      provider: s.aiProvider,
      model: s.aiModel,
      dailyBudgetUsd: budget2(s.aiDailyBudget),
      todayCostUsd: cost6(o.todayCost),
      politeParticle: s.aiPoliteParticle,
      instructions: s.aiInstructions,
    },
    guard: {
      enabled: s.guardEnabled,
      topics: [...s.guardTopics],
      blockedToday: o.guardBlockedToday,
    },
    line: {
      configured: s.lineConfigured,
      status: !s.lineConfigured
        ? 'not_configured'
        : s.lastLineError !== null
          ? 'error'
          : 'connected',
      botName: s.lineBotName,
      basicId: s.lineBasicId,
      channelId: s.lineChannelId,
      secretStatus: lineSecretStatus(s),
      webhookUrl: o.webhookUrl,
      lastWebhookAt: isoOrNull(s.lastWebhookAt),
    },
    client: { pollIntervalMs: o.pollIntervalMs },
  };
};

const toErrorAt = (
  e: { code: ErrorCode; at: Date } | null,
): { code: ErrorCode; at: string } | null => (e === null ? null : { code: e.code, at: iso(e.at) });

export const toSystemStatusDto = (o: GetSystemStatusOutput): SystemStatusDto => ({
  lastWebhookAt: isoOrNull(o.lastWebhookAt),
  lastLineError: toErrorAt(o.lastLineError),
  lastAiError: toErrorAt(o.lastAiError),
  todayCostUsd: cost6(o.todayCost),
  dailyBudgetUsd: budget2(o.dailyBudget),
  priceTableDate: o.priceTableDate,
  database: o.database,
});

export const toGuardrailStatsDto = (s: GuardrailStats): GuardrailStatsDto => ({
  aiEnabled: s.aiEnabled,
  guardEnabled: s.guardEnabled,
  guardBlocked: s.guardBlocked,
  outputRejected: s.outputRejected,
  handoffs: {
    notInKnowledge: s.handoffs.notInKnowledge,
    needsHuman: s.handoffs.needsHuman,
    failedOrTimeout: s.handoffs.failedOrTimeout,
    other: s.handoffs.other,
  },
  budgetReached: s.budgetReached,
  nonText: s.nonText,
});

export const toTestTopicGuardResponse = (o: TestTopicGuardOutput): TestTopicGuardResponse => ({
  allowed: o.allowed,
  matchedTopic: o.matchedTopic,
  costUsd: cost6(o.cost),
});

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export const toDocumentDto = (d: KbDocument): DocumentDto => ({
  id: d.id,
  fileName: d.fileName,
  sizeBytes: d.sizeBytes,
  pageCount: d.pageCount,
  tokenCount: d.tokenCount,
  status: d.status,
  errorCode: d.error,
  createdAt: iso(d.createdAt),
  updatedAt: iso(d.updatedAt),
});

export const toDocumentDetailDto = (d: KbDocumentWithText): DocumentDetailDto => ({
  ...toDocumentDto(d),
  extractedText: d.extractedText,
});

export const toListDocumentsResponse = (o: ListDocumentsOutput): ListDocumentsResponse => ({
  documents: o.documents.map(toDocumentDto),
  usedTokens: o.usedTokens,
  capacityTokens: o.capacityTokens,
});

// ---------------------------------------------------------------------------
// Uploads, usage
// ---------------------------------------------------------------------------

/** The storage key stays on the server; the browser gets only what it needs to upload. */
export const toUploadTargetDto = (t: UploadTarget): UploadTargetDto =>
  t.strategy === 'http_put'
    ? {
        strategy: 'http_put',
        url: t.url,
        headers: { ...t.headers },
        contentType: t.contentType,
        maxSizeBytes: t.maxSizeBytes,
      }
    : {
        strategy: 'vercel_blob_client',
        pathname: t.pathname,
        clientToken: t.clientToken,
        contentType: t.contentType,
        maxSizeBytes: t.maxSizeBytes,
      };

export const toUploadTicketDto = (o: IssueUploadOutput): UploadTicketDto => ({
  uploadId: o.uploadId,
  expiresAt: iso(o.expiresAt),
  original: toUploadTargetDto(o.original),
  preview: toUploadTargetDto(o.preview),
});

const tokenFields = (u: TokenUsage) => ({
  inputTokens: u.inputTokens,
  outputTokens: u.outputTokens,
  cacheReadTokens: u.cacheReadTokens,
  cacheWriteTokens: u.cacheWriteTokens,
});

const totalTokens = (u: TokenUsage): number =>
  u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;

export const toUsageRowDto = (r: UsageByContactRow): UsageRowDto => ({
  contactId: r.contactId,
  displayName: r.displayName,
  pictureUrl: r.pictureUrl,
  replyCount: r.replyCount,
  ...tokenFields(r.usage),
  totalTokens: totalTokens(r.usage),
  costUsd: cost6(r.cost),
});

const toSummaryRow = (s: { count: number; usage: TokenUsage; cost: NanoUsd }) => ({
  count: s.count,
  ...tokenFields(s.usage),
  totalTokens: totalTokens(s.usage),
  costUsd: cost6(s.cost),
});

export const toUsageReportResponse = (r: UsageReport): UsageReportResponse => ({
  month: r.month,
  priceTableDate: r.priceTableDate,
  contacts: r.contacts.map(toUsageRowDto),
  ingest: toSummaryRow(r.ingest),
  guard: toSummaryRow(r.guard),
  totalCostUsd: cost6(r.totalCost),
  replyCount: r.replyCount,
  averageCostPerReplyUsd: r.averageCostPerReply === null ? null : cost6(r.averageCostPerReply),
  noResponseCount: r.noResponseCount,
});

export const toUsageRecordDto = (r: AiUsageRecord): UsageRecordDto => ({
  id: r.id,
  createdAt: iso(r.createdAt),
  kind: r.kind,
  model: r.model,
  ...tokenFields(r.usage),
  costUsd: cost6(r.cost),
  outcome: r.outcome,
});

export const toContactUsageResponse = (
  records: readonly AiUsageRecord[],
): ContactUsageResponse => ({
  records: records.map(toUsageRecordDto),
});
