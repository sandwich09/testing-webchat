import { describe, expect, it } from 'vitest';
import type {
  AiUsageRecord,
  Contact,
  ContactId,
  DocumentId,
  KbDocumentWithText,
  LineUserId,
  Message,
  MessageId,
  NanoUsd,
  Seq,
  Settings,
  StorageKey,
  UploadId,
  UsageId,
} from '@/core/domain';
import {
  contactDetailDtoSchema,
  contactDtoSchema,
  contactUsageResponseSchema,
  documentDetailDtoSchema,
  documentDtoSchema,
  getMessagesResponseSchema,
  guardrailStatsDtoSchema,
  listContactsResponseSchema,
  listDocumentsResponseSchema,
  messageDtoSchema,
  settingsDtoSchema,
  systemStatusDtoSchema,
  testTopicGuardResponseSchema,
  uploadTicketDtoSchema,
  usageReportResponseSchema,
} from '@/contracts';
import { decodeContactCursor } from './http-request';
import {
  stickerImageUrl,
  toContactDetailDto,
  toContactDto,
  toContactUsageResponse,
  toDocumentDetailDto,
  toDocumentDto,
  toGetMessagesResponse,
  toGuardrailStatsDto,
  toListContactsResponse,
  toListDocumentsResponse,
  toMessageDto,
  toSettingsDto,
  toSystemStatusDto,
  toTestTopicGuardResponse,
  toUploadTicketDto,
  toUsageReportResponse,
} from './to-dto';
import { LINE_RETRY_KEY_WINDOW_MS } from '@/core/domain';

const T = new Date('2026-11-18T07:32:10.123Z');
const T2 = new Date('2026-11-18T08:00:00.000Z');
const usd = (n: bigint) => n as NanoUsd;
const seq = (n: bigint) => n as Seq;

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: '0193a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b' as ContactId,
  lineUserId: 'U123' as LineUserId,
  displayName: 'มะลิ',
  pictureUrl: 'https://profile.line-scdn.net/abc',
  followStatus: 'following',
  followedAt: T,
  aiEnabled: true,
  needsAdmin: true,
  needsAdminReason: 'ai_needs_human_action',
  aiState: 'idle',
  aiStateAt: null,
  unreadCount: 2,
  lastMessageAt: T2,
  lastMessagePreview: 'สวัสดี',
  lastMessageBy: 'customer',
  lastMessageType: 'text',
  replyToken: 'secret-reply-token',
  replyTokenExpiresAt: T2,
  createdAt: T,
  updatedSeq: seq(1048576n),
  ...over,
});

const message = (over: Partial<Message> = {}): Message => ({
  id: '0193a0b1-0000-7000-8000-000000000001' as MessageId,
  seq: seq(10n),
  updatedSeq: seq(12n),
  contactId: contact().id,
  direction: 'inbound',
  author: 'customer',
  type: 'text',
  text: 'hello',
  mediaUrl: null,
  previewUrl: null,
  mediaStatus: null,
  stickerPackageId: null,
  stickerId: null,
  otherKind: null,
  eventCode: null,
  lineMessageId: null,
  deliveryStatus: null,
  deliveryError: null,
  retryKey: null,
  createdAt: T,
  sentAt: null,
  firstPushAt: null,
  ...over,
});

const settings = (over: Partial<Settings> = {}): Settings => ({
  aiEnabled: true,
  aiProvider: 'claude',
  aiModel: 'claude-opus-5-5',
  aiDailyBudget: usd(2_000_000_000n),
  aiPoliteParticle: 'ค่ะ',
  aiInstructions: '',
  guardEnabled: true,
  guardTopics: ['เมนู', 'เวลาเปิด'],
  lineConfigured: true,
  lineBotName: 'Shop',
  lineBasicId: '@shop',
  lineChannelId: null,
  lineSecretVerifiedAt: null,
  lastWebhookAt: T,
  lastLineError: null,
  lastAiError: null,
  ...over,
});

describe('contacts', () => {
  it('maps a contact to a ContactDto that passes the contract', () => {
    const dto = contactDtoSchema.parse(toContactDto(contact()));
    expect(dto).toMatchObject({
      followedAt: '2026-11-18T07:32:10.123Z',
      aiReplying: false,
      updatedSeq: '1048576',
      lastMessage: { at: '2026-11-18T08:00:00.000Z', by: 'customer', type: 'text', text: 'สวัสดี' },
    });
    expect(JSON.stringify(dto)).not.toContain('secret-reply-token');
    expect(dto).not.toHaveProperty('lineUserId');
  });

  it('marks aiReplying and leaves lastMessage null for a contact without messages', () => {
    const dto = toContactDto(
      contact({
        aiState: 'replying',
        lastMessageAt: null,
        lastMessageBy: null,
        lastMessageType: null,
      }),
    );
    expect(dto.aiReplying).toBe(true);
    expect(dto.lastMessage).toBeNull();
    expect(contactDtoSchema.parse(dto)).toBeTruthy();
  });

  it('keeps nulls of a media preview', () => {
    const dto = toContactDto(contact({ lastMessagePreview: null, lastMessageType: 'image' }));
    expect(dto.lastMessage).toMatchObject({ type: 'image', text: null });
  });

  it('maps the contact detail and the list response with an opaque cursor', () => {
    expect(
      contactDetailDtoSchema.parse(
        toContactDetailDto({ contact: contact(), stats: { messageCount: 5, aiMessageCount: 1 } }),
      ).stats,
    ).toEqual({ messageCount: 5, aiMessageCount: 1 });

    const next = { sortAt: T2, id: contact().id };
    const list = listContactsResponseSchema.parse(
      toListContactsResponse({
        contacts: [contact()],
        next,
        hasMore: true,
        highWater: seq(99n),
        counts: { all: 3, unread: 1, needsAdmin: 2 },
        lineConfigured: true,
      }),
    );
    expect(list.highWater).toBe('99');
    expect(list.before).not.toBeNull();
    expect(decodeContactCursor(list.before ?? '')).toEqual({ ok: true, value: next });
    expect(
      toListContactsResponse({
        contacts: [],
        next: null,
        hasMore: false,
        highWater: seq(0n),
        counts: { all: 0, unread: 0, needsAdmin: 0 },
        lineConfigured: false,
      }).before,
    ).toBeNull();
  });
});

describe('messages', () => {
  it('maps a text message: no media, sticker or delivery for inbound', () => {
    const dto = messageDtoSchema.parse(toMessageDto(message()));
    expect(dto).toMatchObject({
      seq: '10',
      updatedSeq: '12',
      media: null,
      sticker: null,
      delivery: null,
    });
    expect(dto).not.toHaveProperty('lineMessageId');
    expect(dto).not.toHaveProperty('retryKey');
  });

  it('hides the media URL until the file is ready', () => {
    const pending = toMessageDto(
      message({ type: 'image', mediaStatus: 'pending', mediaUrl: 'https://x/a.jpg', text: null }),
    );
    expect(pending.media).toEqual({ status: 'pending', url: null, previewUrl: null });
    const ready = toMessageDto(
      message({
        type: 'video',
        mediaStatus: 'ready',
        mediaUrl: 'https://x/a.mp4',
        previewUrl: 'https://x/p.jpg',
      }),
    );
    expect(ready.media).toEqual({
      status: 'ready',
      url: 'https://x/a.mp4',
      previewUrl: 'https://x/p.jpg',
    });
    expect(messageDtoSchema.parse(ready)).toBeTruthy();
  });

  it('builds the sticker image URL on the server', () => {
    const dto = toMessageDto(
      message({ type: 'sticker', text: null, stickerPackageId: '446', stickerId: '1988' }),
    );
    expect(dto.sticker).toEqual({
      packageId: '446',
      stickerId: '1988',
      imageUrl: 'https://stickershop.line-scdn.net/stickershop/v1/sticker/1988/android/sticker.png',
    });
    expect(stickerImageUrl('a/b')).toContain('/sticker/a%2Fb/');
  });

  it('gives outbound messages a delivery status, event lines none', () => {
    const out = toMessageDto(
      message({
        direction: 'outbound',
        author: 'admin',
        deliveryStatus: 'failed',
        deliveryError: 'line.push_failed',
        sentAt: null,
      }),
    );
    expect(out.delivery).toEqual({
      status: 'failed',
      errorCode: 'line.push_failed',
      retryExpiresAt: null,
    });
    // The retry key window ends LINE_RETRY_KEY_WINDOW_MS after the first push.
    const pushed = toMessageDto(
      message({
        direction: 'outbound',
        author: 'admin',
        deliveryStatus: 'failed',
        deliveryError: 'line.push_failed',
        firstPushAt: T,
      }),
    );
    expect(pushed.delivery?.retryExpiresAt).toBe(
      new Date(T.getTime() + LINE_RETRY_KEY_WINDOW_MS).toISOString(),
    );
    expect(messageDtoSchema.parse(pushed).delivery?.retryExpiresAt).toBe(
      pushed.delivery?.retryExpiresAt,
    );
    const event = toMessageDto(
      message({
        direction: 'internal',
        author: 'system',
        type: 'event',
        text: null,
        eventCode: 'guard.blocked',
      }),
    );
    expect(event.delivery).toBeNull();
    expect(messageDtoSchema.parse(event).eventCode).toBe('guard.blocked');
  });

  it('maps the messages response', () => {
    const r = getMessagesResponseSchema.parse(
      toGetMessagesResponse({
        messages: [message()],
        hasOlder: null,
        hasMore: true,
        highWater: seq(7n),
      }),
    );
    expect(r).toMatchObject({ hasOlder: null, hasMore: true, highWater: '7' });
  });
});

describe('settings and system', () => {
  const base = {
    webhookUrl: 'http://localhost:3000/api/line/webhook',
    todayCost: usd(12_345_000n),
    guardBlockedToday: 3,
    pollIntervalMs: 2000,
  };

  it('maps SettingsDto with money strings, guard fields and the poll interval', () => {
    const dto = settingsDtoSchema.parse(toSettingsDto({ settings: settings(), ...base }));
    expect(dto.ai).toMatchObject({ dailyBudgetUsd: '2.00', todayCostUsd: '0.012345' });
    expect(dto.guard).toEqual({
      enabled: true,
      topics: ['เมนู', 'เวลาเปิด'],
      blockedToday: 3,
    });
    expect(dto.client).toEqual({ pollIntervalMs: 2000 });
    expect(dto.line.status).toBe('connected');
  });

  it.each([
    ['not_configured', { lineConfigured: false }],
    ['error', { lastLineError: { code: 'line.unauthorized' as const, at: T } }],
    [
      'not_configured',
      { lineConfigured: false, lastLineError: { code: 'line.unauthorized' as const, at: T } },
    ],
  ])('derives line.status %s', (status, over) => {
    expect(toSettingsDto({ settings: settings(over), ...base }).line.status).toBe(status);
  });

  it.each([
    ['no_channel_id', { lineChannelId: null, lineSecretVerifiedAt: null }],
    ['unchecked', { lineChannelId: '1234567890', lineSecretVerifiedAt: null }],
    ['verified', { lineChannelId: '1234567890', lineSecretVerifiedAt: T }],
  ] as const)('returns the Channel ID and line.secretStatus %s', (secretStatus, over) => {
    const dto = settingsDtoSchema.parse(toSettingsDto({ settings: settings(over), ...base }));
    expect(dto.line).toMatchObject({ channelId: over.lineChannelId, secretStatus });
  });

  it('maps the system status and guardrail stats', () => {
    const status = systemStatusDtoSchema.parse(
      toSystemStatusDto({
        lastWebhookAt: null,
        lastLineError: { code: 'line.unavailable', at: T },
        lastAiError: null,
        todayCost: usd(0n),
        dailyBudget: usd(10_000_000_000n),
        priceTableDate: '2026-11-03',
        database: 'ok',
      }),
    );
    expect(status).toMatchObject({
      todayCostUsd: '0.000000',
      dailyBudgetUsd: '10.00',
      lastLineError: { code: 'line.unavailable', at: '2026-11-18T07:32:10.123Z' },
    });

    const stats = {
      aiEnabled: true,
      guardEnabled: false,
      guardBlocked: 1,
      outputRejected: 2,
      handoffs: { notInKnowledge: 3, needsHuman: 4, failedOrTimeout: 5, other: 6 },
      budgetReached: 7,
      nonText: 8,
    };
    expect(guardrailStatsDtoSchema.parse(toGuardrailStatsDto(stats))).toEqual(stats);
  });

  it('maps the topic guard test', () => {
    expect(
      testTopicGuardResponseSchema.parse(
        toTestTopicGuardResponse({ allowed: false, matchedTopic: null, cost: usd(1_500n) }),
      ),
    ).toEqual({ allowed: false, matchedTopic: null, costUsd: '0.000002' });
  });
});

describe('knowledge, uploads and usage', () => {
  const doc: KbDocumentWithText = {
    id: 'd1' as DocumentId,
    fileName: 'menu.pdf',
    sizeBytes: 1000,
    sha256: 'a'.repeat(64),
    pageCount: 3,
    tokenCount: 1200,
    status: 'failed',
    error: 'knowledge.too_many_pages',
    createdAt: T,
    updatedAt: T2,
    extractedText: null,
  };

  it('maps documents without the hash', () => {
    const dto = documentDtoSchema.parse(toDocumentDto(doc));
    expect(dto).toMatchObject({
      errorCode: 'knowledge.too_many_pages',
      updatedAt: '2026-11-18T08:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('sha256');
    expect(documentDetailDtoSchema.parse(toDocumentDetailDto(doc)).extractedText).toBeNull();
    expect(
      listDocumentsResponseSchema.parse(
        toListDocumentsResponse({ documents: [doc], usedTokens: 10, capacityTokens: 50_000 }),
      ).documents,
    ).toHaveLength(1);
  });

  it('maps an upload ticket without the storage key', () => {
    const dto = uploadTicketDtoSchema.parse(
      toUploadTicketDto({
        uploadId: 'abcdefghijklmnopqrstuv' as UploadId,
        expiresAt: T2,
        original: {
          strategy: 'http_put',
          key: 'out/k/original.jpg' as StorageKey,
          contentType: 'image/jpeg',
          maxSizeBytes: 10,
          url: 'http://localhost:3000/api/local-storage/out/k/original.jpg?exp=1&sig=s',
          headers: { 'Content-Type': 'image/jpeg' },
        },
        preview: {
          strategy: 'vercel_blob_client',
          key: 'out/k/preview.jpg' as StorageKey,
          contentType: 'image/jpeg',
          maxSizeBytes: 5,
          pathname: 'out/k/preview.jpg',
          clientToken: 'vercel_blob_client_token',
        },
      }),
    );
    expect(dto.original).not.toHaveProperty('key');
    expect(dto.preview).not.toHaveProperty('key');
    expect(dto.preview).toMatchObject({ pathname: 'out/k/preview.jpg' });
  });

  it('maps the usage report with total tokens and the guard row', () => {
    const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
    const r = usageReportResponseSchema.parse(
      toUsageReportResponse({
        month: '2026-11',
        priceTableDate: '2026-11-03',
        contacts: [
          {
            contactId: null,
            displayName: null,
            pictureUrl: null,
            replyCount: 2,
            okCount: 1,
            usage,
            cost: usd(1_000_000n),
          },
        ],
        ingest: { count: 1, usage, cost: usd(0n) },
        guard: { count: 4, usage, cost: usd(500n) },
        totalCost: usd(1_000_500n),
        replyCount: 2,
        averageCostPerReply: null,
        noResponseCount: 3,
      }),
    );
    expect(r.noResponseCount).toBe(3);
    expect(r.contacts[0]).toMatchObject({ totalTokens: 10, costUsd: '0.001000' });
    expect(r.contacts[0]).not.toHaveProperty('okCount');
    expect(r.guard).toEqual({ count: 4, ...usage, totalTokens: 10, costUsd: '0.000001' });
    expect(r.averageCostPerReplyUsd).toBeNull();
    expect(
      toUsageReportResponse({
        month: '2026-11',
        priceTableDate: '2026-11-03',
        contacts: [],
        ingest: { count: 0, usage, cost: usd(0n) },
        guard: { count: 0, usage, cost: usd(0n) },
        totalCost: usd(0n),
        replyCount: 1,
        averageCostPerReply: usd(2_000n),
        noResponseCount: 0,
      }).averageCostPerReplyUsd,
    ).toBe('0.000002');
  });

  it('maps usage records', () => {
    const record: AiUsageRecord = {
      id: 'u1' as UsageId,
      kind: 'guard',
      contactId: null,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: usd(3_000n),
      outcome: 'blocked',
      error: null,
      createdAt: T,
    };
    const r = contactUsageResponseSchema.parse(toContactUsageResponse([record]));
    expect(r.records[0]).toMatchObject({ kind: 'guard', outcome: 'blocked', costUsd: '0.000003' });
    expect(r.records[0]).not.toHaveProperty('error');
  });
});
