import { describe, expect, it } from 'vitest';
import { PREVIEW_TEXT_MAX_UNITS, previewOf } from '@/core/domain';
import {
  contactDetailDtoSchema,
  contactDtoSchema,
  documentDetailDtoSchema,
  guardrailStatsDtoSchema,
  messageDtoSchema,
  settingsDtoSchema,
  systemStatusDtoSchema,
  uploadTicketDtoSchema,
  usageRecordDtoSchema,
  usageRowDtoSchema,
  documentDtoSchema,
} from './dto.contract';
import { errorResponseSchema } from './error.contract';

const NOW = '2026-11-18T07:32:10.123Z';

const contact = {
  id: '0193a000-0000-7000-8000-000000000001',
  displayName: 'Somchai',
  pictureUrl: null,
  followStatus: 'following',
  followedAt: NOW,
  aiEnabled: true,
  needsAdmin: true,
  needsAdminReason: 'budget_reached',
  aiReplying: false,
  unreadCount: 2,
  lastMessage: { at: NOW, by: 'customer', type: 'text', text: 'hello' },
  createdAt: NOW,
  updatedSeq: '1048576',
};

const message = {
  id: '0193a000-0000-7000-8000-000000000002',
  seq: '10',
  updatedSeq: '12',
  contactId: contact.id,
  direction: 'inbound',
  author: 'customer',
  type: 'image',
  text: null,
  media: { status: 'ready', url: 'https://x.test/a.jpg', previewUrl: null },
  sticker: null,
  otherKind: null,
  eventCode: null,
  quote: null,
  delivery: null,
  createdAt: NOW,
  sentAt: null,
};

const document = {
  id: 'd1',
  fileName: 'menu.pdf',
  sizeBytes: 1000,
  pageCount: 2,
  tokenCount: null,
  status: 'processing',
  errorCode: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const usageBase = {
  inputTokens: 1,
  outputTokens: 2,
  cacheReadTokens: 3,
  cacheWriteTokens: 4,
  costUsd: '0.012345',
};

const target = {
  strategy: 'http_put',
  url: 'http://localhost:3000/api/local-storage/a?exp=1&sig=x',
  headers: { 'Content-Type': 'image/jpeg' },
  contentType: 'image/jpeg',
  maxSizeBytes: 100,
};

describe('DTO schemas', () => {
  it('accept valid examples', () => {
    expect(contactDtoSchema.safeParse(contact).success).toBe(true);
    expect(
      contactDetailDtoSchema.safeParse({
        ...contact,
        stats: { messageCount: 3, aiMessageCount: 1 },
      }).success,
    ).toBe(true);
    expect(messageDtoSchema.safeParse(message).success).toBe(true);
    expect(documentDtoSchema.safeParse(document).success).toBe(true);
    expect(documentDetailDtoSchema.safeParse({ ...document, extractedText: null }).success).toBe(
      true,
    );
    expect(
      usageRowDtoSchema.safeParse({
        ...usageBase,
        contactId: null,
        displayName: null,
        pictureUrl: null,
        replyCount: 1,
        totalTokens: 10,
      }).success,
    ).toBe(true);
    expect(
      usageRecordDtoSchema.safeParse({
        ...usageBase,
        id: 'u',
        createdAt: NOW,
        kind: 'reply',
        model: 'claude-opus-5-5',
        outcome: 'ok',
      }).success,
    ).toBe(true);
    expect(
      systemStatusDtoSchema.safeParse({
        lastWebhookAt: null,
        lastLineError: { code: 'line.push_failed', at: NOW },
        lastAiError: null,
        todayCostUsd: '0.000000',
        dailyBudgetUsd: '5.00',
        priceTableDate: '2026-11-03',
        database: 'ok',
      }).success,
    ).toBe(true);
    expect(
      settingsDtoSchema.safeParse({
        ai: {
          enabled: true,
          provider: 'claude',
          model: 'claude-sonnet-5-5',
          dailyBudgetUsd: '5.00',
          todayCostUsd: '0.000000',
          politeParticle: 'ครับ',
          instructions: '',
          name: null,
          answerMode: 'general',
        },
        guard: {
          enabled: true,
          topics: ['มุกตลกไทย', 'มุกจากภาพยนตร์'],
          blockedToday: 3,
        },
        line: {
          configured: false,
          status: 'not_configured',
          botName: null,
          basicId: null,
          channelId: null,
          secretStatus: 'no_channel_id',
          webhookUrl: 'https://x.test/api/line/webhook',
          lastWebhookAt: null,
        },
        richMenu: {
          published: false,
          publishedAt: null,
          lastError: null,
          howToText: '',
          howToDefault: 'ลองได้ตามนี้เลยค่ะ',
        },
        welcome: {
          enabled: true,
          text: '',
          defaultText: 'ขอบคุณที่เพิ่มเพื่อน',
          accountName: 'Test webchat',
        },
        client: { pollIntervalMs: 3000 },
      }).success,
    ).toBe(true);
  });

  it('accept both upload strategies and reject an unknown one', () => {
    const ticket = {
      uploadId: 'AAAAAAAAAAAAAAAAAAAAAA',
      expiresAt: NOW,
      original: target,
      preview: {
        strategy: 'vercel_blob_client',
        pathname: 'p/a.jpg',
        clientToken: 't',
        contentType: 'image/jpeg',
        maxSizeBytes: 10,
      },
    };
    expect(uploadTicketDtoSchema.safeParse(ticket).success).toBe(true);
    expect(
      uploadTicketDtoSchema.safeParse({ ...ticket, original: { ...target, strategy: 'ftp' } })
        .success,
    ).toBe(false);
  });

  it('reject extra fields, bad enums, bad formats and missing nulls', () => {
    expect(contactDtoSchema.safeParse({ ...contact, extra: 1 }).success).toBe(false);
    expect(contactDtoSchema.safeParse({ ...contact, followStatus: 'blocked' }).success).toBe(false);
    expect(contactDtoSchema.safeParse({ ...contact, updatedSeq: 1048576 }).success).toBe(false);
    expect(contactDtoSchema.safeParse({ ...contact, createdAt: '2026-11-18' }).success).toBe(false);
    // The screens check code units only (PREVIEW_TEXT_MAX_UNITS), never graphemes with the
    // browser's own rules: whatever previewOf can emit passes, in any browser.
    const thai = previewOf({ type: 'text', text: 'กี้'.repeat(150) }).text ?? '';
    const devanagari = previewOf({ type: 'text', text: 'क्षि'.repeat(150) }).text ?? '';
    const stacked = previewOf({ type: 'text', text: `a${'\u0301'.repeat(2000)}b` }).text ?? '';
    for (const text of [thai, devanagari, stacked, 'x'.repeat(100)]) {
      expect(text.length).toBeLessThanOrEqual(PREVIEW_TEXT_MAX_UNITS);
      expect(
        contactDtoSchema.safeParse({ ...contact, lastMessage: { ...contact.lastMessage, text } })
          .success,
      ).toBe(true);
    }
    expect(thai.length).toBe(300);
    expect(devanagari.length).toBeGreaterThan(100);
    expect(
      contactDtoSchema.safeParse({
        ...contact,
        lastMessage: { ...contact.lastMessage, text: 'x'.repeat(PREVIEW_TEXT_MAX_UNITS + 1) },
      }).success,
    ).toBe(false);
    const withoutSentAt: Record<string, unknown> = { ...message };
    delete withoutSentAt.sentAt;
    expect(messageDtoSchema.safeParse(withoutSentAt).success).toBe(false);
    expect(
      messageDtoSchema.safeParse({ ...message, eventCode: 'handoff.not_a_reason' }).success,
    ).toBe(false);
    expect(messageDtoSchema.safeParse({ ...message, eventCode: 'handoff.ai_other' }).success).toBe(
      true,
    );
    expect(
      messageDtoSchema.safeParse({
        ...message,
        delivery: { status: 'failed', errorCode: 'line.client.network' },
      }).success,
    ).toBe(false);
    expect(
      usageRowDtoSchema.safeParse({
        ...usageBase,
        contactId: null,
        displayName: null,
        pictureUrl: null,
        replyCount: 1,
        totalTokens: 10,
        costUsd: '0.01',
      }).success,
    ).toBe(false);
  });
});

describe('topic guard DTOs', () => {
  const settings = {
    ai: {
      enabled: false,
      provider: 'claude',
      model: 'claude-opus-5-5',
      dailyBudgetUsd: '2.00',
      todayCostUsd: '0.000000',
      politeParticle: 'ค่ะ',
      instructions: '',
      name: null,
      answerMode: 'general',
    },
    guard: { enabled: false, topics: [], blockedToday: 0 },
    line: {
      configured: false,
      status: 'not_configured',
      botName: null,
      basicId: null,
      channelId: null,
      secretStatus: 'no_channel_id',
      webhookUrl: 'https://x.test/api/line/webhook',
      lastWebhookAt: null,
    },
    richMenu: {
      published: false,
      publishedAt: null,
      lastError: null,
      howToText: '',
      howToDefault: 'ลองได้ตามนี้เลยค่ะ',
    },
    welcome: { enabled: true, text: '', defaultText: 'ขอบคุณที่เพิ่มเพื่อน', accountName: 'Test webchat' },
    client: { pollIntervalMs: 2000 },
  };

  it('SettingsDto requires the guard block, strict', () => {
    expect(settingsDtoSchema.safeParse(settings).success).toBe(true);
    const withoutGuard: Record<string, unknown> = { ...settings };
    delete withoutGuard.guard;
    expect(settingsDtoSchema.safeParse(withoutGuard).success).toBe(false);
    for (const guard of [
      { ...settings.guard, extra: 1 },
      { ...settings.guard, blockedToday: -1 },
      { ...settings.guard, blockedToday: 1.5 },
      { ...settings.guard, topics: [1] },
      { enabled: false, topics: [] },
      { ...settings.guard, refusalText: 'x' },
    ]) {
      expect(
        settingsDtoSchema.safeParse({ ...settings, guard }).success,
        JSON.stringify(guard),
      ).toBe(false);
    }
  });

  const stats = {
    aiEnabled: true,
    guardEnabled: true,
    guardBlocked: 2,
    outputRejected: 1,
    handoffs: { notInKnowledge: 0, needsHuman: 1, failedOrTimeout: 2, other: 0 },
    budgetReached: 0,
    nonText: 4,
  };

  it('GuardrailStatsDto accepts counts and rejects extras and bad numbers', () => {
    expect(guardrailStatsDtoSchema.safeParse(stats).success).toBe(true);
    expect(guardrailStatsDtoSchema.safeParse({ ...stats, extra: 1 }).success).toBe(false);
    expect(guardrailStatsDtoSchema.safeParse({ ...stats, guardBlocked: -1 }).success).toBe(false);
    expect(guardrailStatsDtoSchema.safeParse({ ...stats, nonText: '4' }).success).toBe(false);
    expect(
      guardrailStatsDtoSchema.safeParse({ ...stats, handoffs: { ...stats.handoffs, x: 1 } })
        .success,
    ).toBe(false);
    const withoutHandoff: Record<string, unknown> = { ...stats.handoffs };
    delete withoutHandoff.other;
    expect(guardrailStatsDtoSchema.safeParse({ ...stats, handoffs: withoutHandoff }).success).toBe(
      false,
    );
  });

  it('UsageRecordDto takes the guard kind and the blocked outcome', () => {
    const record = {
      ...usageBase,
      id: 'u',
      createdAt: NOW,
      kind: 'guard',
      model: 'claude-haiku-5-5',
      outcome: 'blocked',
    };
    expect(usageRecordDtoSchema.safeParse(record).success).toBe(true);
    expect(usageRecordDtoSchema.safeParse({ ...record, kind: 'moderation' }).success).toBe(false);
    expect(usageRecordDtoSchema.safeParse({ ...record, outcome: 'filtered' }).success).toBe(false);
  });

  it('MessageDto takes a quote, available or not, and rejects a partial one', () => {
    const quote = {
      available: true,
      messageId: '0193a0b1-0000-7000-8000-000000000009',
      author: 'ai',
      type: 'image',
      textPreview: null,
      mediaKind: 'image',
    };
    expect(messageDtoSchema.safeParse({ ...message, quote }).success).toBe(true);
    const unavailable = {
      available: false,
      messageId: null,
      author: null,
      type: null,
      textPreview: null,
      mediaKind: null,
    };
    expect(messageDtoSchema.safeParse({ ...message, quote: unavailable }).success).toBe(true);
    expect(messageDtoSchema.safeParse({ ...message, quote: { available: true } }).success).toBe(
      false,
    );
    expect(
      messageDtoSchema.safeParse({ ...message, quote: { ...quote, mediaKind: 'gif' } }).success,
    ).toBe(false);
  });

  it('MessageDto takes the guard.blocked event code', () => {
    expect(
      messageDtoSchema.safeParse({
        ...message,
        direction: 'internal',
        author: 'system',
        type: 'event',
        media: null,
        eventCode: 'guard.blocked',
      }).success,
    ).toBe(true);
  });
});

describe('errorResponseSchema', () => {
  it('accepts the documented shape and rejects unknown codes and extras', () => {
    const body = { error: { code: 'line.push_failed', message: 'm', requestId: 'r' } };
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(
      errorResponseSchema.safeParse({ error: { ...body.error, code: 'client.network' } }).success,
    ).toBe(false);
    expect(errorResponseSchema.safeParse({ ...body, detail: 'x' }).success).toBe(false);
  });

  it('accepts the two settings codes of the topic guard', () => {
    for (const code of ['settings.guard_topics_required', 'settings.guard_rate_limited']) {
      expect(
        errorResponseSchema.safeParse({ error: { code, message: 'm', requestId: 'r' } }).success,
        code,
      ).toBe(true);
    }
  });
});
