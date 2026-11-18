import { describe, expect, it } from 'vitest';
import { unlockBodySchema } from './access.contract';
import {
  createCannedReplyBodySchema,
  updateCannedReplyBodySchema,
} from './canned-replies.contract';
import { CANNED_TEXT_MAX_CHARS, CANNED_TITLE_MAX_CHARS } from './limits.contract';
import { documentParamsSchema, knowledgeFilePartSchema } from './knowledge.contract';
import { localStorageParamsSchema, writeLocalUploadQuerySchema } from './local-storage.contract';
import { discardUploadParamsSchema, issueUploadBodySchema } from './uploads.contract';
import { guardrailStatsResponseSchema } from './system.contract';
import { usageQuerySchema, usageReportResponseSchema } from './usage.contract';
import { lineWebhookBodySchema, webhookHeadersSchema } from './webhook.contract';
import * as contracts from './index';

describe('unlockBodySchema', () => {
  it('trims and bounds the code', () => {
    const parsed = unlockBodySchema.safeParse({ code: '  abc ' });
    expect(parsed.success && parsed.data.code).toBe('abc');
    expect(unlockBodySchema.safeParse({ code: '   ' }).success).toBe(false);
    expect(unlockBodySchema.safeParse({ code: 'x'.repeat(201) }).success).toBe(false);
    expect(unlockBodySchema.safeParse({ code: 'a', extra: 1 }).success).toBe(false);
  });
});

describe('canned reply bodies', () => {
  it('validates create', () => {
    expect(createCannedReplyBodySchema.safeParse({ title: 'Hi', text: 'Hello' }).success).toBe(
      true,
    );
    expect(createCannedReplyBodySchema.safeParse({ title: ' ', text: 'Hello' }).success).toBe(
      false,
    );
    expect(createCannedReplyBodySchema.safeParse({ title: 'Hi' }).success).toBe(false);
    expect(
      createCannedReplyBodySchema.safeParse({
        title: 'x'.repeat(CANNED_TITLE_MAX_CHARS + 1),
        text: 'a',
      }).success,
    ).toBe(false);
    expect(
      createCannedReplyBodySchema.safeParse({
        title: 'a',
        text: 'x'.repeat(CANNED_TEXT_MAX_CHARS + 1),
      }).success,
    ).toBe(false);
  });

  it('validates update: at least one field, sortOrder 0 to 10000', () => {
    expect(updateCannedReplyBodySchema.safeParse({ sortOrder: 0 }).success).toBe(true);
    expect(updateCannedReplyBodySchema.safeParse({ sortOrder: 10_000 }).success).toBe(true);
    expect(updateCannedReplyBodySchema.safeParse({ sortOrder: 10_001 }).success).toBe(false);
    expect(updateCannedReplyBodySchema.safeParse({ sortOrder: -1 }).success).toBe(false);
    expect(updateCannedReplyBodySchema.safeParse({ sortOrder: 1.5 }).success).toBe(false);
    expect(updateCannedReplyBodySchema.safeParse({}).success).toBe(false);
    expect(updateCannedReplyBodySchema.safeParse({ title: 'a', extra: 1 }).success).toBe(false);
  });
});

describe('uploads', () => {
  const valid = {
    kind: 'image',
    contentType: 'image/png',
    sizeBytes: 100,
    preview: { contentType: 'image/jpeg', sizeBytes: 10 },
  };

  it('validates the ticket request', () => {
    expect(issueUploadBodySchema.safeParse(valid).success).toBe(true);
    expect(issueUploadBodySchema.safeParse({ ...valid, sizeBytes: 0 }).success).toBe(false);
    expect(issueUploadBodySchema.safeParse({ ...valid, kind: 'pdf' }).success).toBe(false);
    expect(issueUploadBodySchema.safeParse({ ...valid, contentType: '' }).success).toBe(false);
    expect(
      issueUploadBodySchema.safeParse({
        ...valid,
        preview: { contentType: 'image/png', sizeBytes: 1 },
      }).success,
    ).toBe(false);
    expect(issueUploadBodySchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });

  it('validates the upload id path', () => {
    expect(
      discardUploadParamsSchema.safeParse({ uploadId: 'AAAAAAAAAAAAAAAAAAAAAA' }).success,
    ).toBe(true);
    expect(discardUploadParamsSchema.safeParse({ uploadId: 'short' }).success).toBe(false);
    expect(
      discardUploadParamsSchema.safeParse({ uploadId: 'AAAAAAAAAAAAAAAAAAAA+/' }).success,
    ).toBe(false);
  });
});

describe('local storage', () => {
  it('validates key segments and the signed query', () => {
    expect(localStorageParamsSchema.safeParse({ key: ['a', 'b.jpg'] }).success).toBe(true);
    expect(localStorageParamsSchema.safeParse({ key: ['a', '..'] }).success).toBe(false);
    expect(localStorageParamsSchema.safeParse({ key: [] }).success).toBe(false);
    expect(localStorageParamsSchema.safeParse({ key: ['a/b'] }).success).toBe(false);
    // The local storage adapter issues `<maxSizeBytes>.<base64url(type)>.<base64url(HMAC)>`.
    const sig = '10485760.aW1hZ2UvanBlZw.q0x_-AbC123';
    expect(writeLocalUploadQuerySchema.safeParse({ exp: '1790000000', sig }).success).toBe(true);
    for (const bad of ['ab-_9', '10.aW1h', 'x.aW1h.sig', '10.aW/1h.sig', '10.aW1h.sig.extra']) {
      expect(writeLocalUploadQuerySchema.safeParse({ exp: '1', sig: bad }).success).toBe(false);
    }
    expect(writeLocalUploadQuerySchema.safeParse({ exp: 'soon', sig: 'ab' }).success).toBe(false);
    expect(writeLocalUploadQuerySchema.safeParse({ exp: '1' }).success).toBe(false);
  });
});

describe('knowledge', () => {
  it('validates the file part and path', () => {
    expect(knowledgeFilePartSchema.safeParse({ fileName: 'a.pdf', sizeBytes: 5 }).success).toBe(
      true,
    );
    expect(knowledgeFilePartSchema.safeParse({ fileName: '', sizeBytes: 5 }).success).toBe(false);
    expect(
      knowledgeFilePartSchema.safeParse({ fileName: 'x'.repeat(201), sizeBytes: 5 }).success,
    ).toBe(false);
    expect(documentParamsSchema.safeParse({ id: '' }).success).toBe(false);
  });
});

describe('usageQuerySchema', () => {
  it('accepts months 01 to 12 only', () => {
    expect(usageQuerySchema.safeParse({}).success).toBe(true);
    expect(usageQuerySchema.safeParse({ month: '2026-11' }).success).toBe(true);
    expect(usageQuerySchema.safeParse({ month: '2026-12' }).success).toBe(true);
    expect(usageQuerySchema.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(usageQuerySchema.safeParse({ month: '2026-00' }).success).toBe(false);
    expect(usageQuerySchema.safeParse({ month: '2026-1' }).success).toBe(false);
  });
});

describe('usageReportResponseSchema', () => {
  const row = {
    count: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: '0.000000',
  };
  const report = {
    month: '2026-11',
    priceTableDate: '2026-11-03',
    contacts: [],
    ingest: row,
    guard: {
      ...row,
      count: 3,
      inputTokens: 1200,
      outputTokens: 60,
      totalTokens: 1260,
      costUsd: '0.000150',
    },
    totalCostUsd: '0.000150',
    replyCount: 0,
    averageCostPerReplyUsd: null,
  };

  it('has a separate guard row next to ingest', () => {
    expect(usageReportResponseSchema.safeParse(report).success).toBe(true);
    const withoutGuard: Record<string, unknown> = { ...report };
    delete withoutGuard.guard;
    expect(usageReportResponseSchema.safeParse(withoutGuard).success).toBe(false);
    expect(
      usageReportResponseSchema.safeParse({ ...report, guard: { ...row, costUsd: '0.1' } }).success,
    ).toBe(false);
    expect(
      usageReportResponseSchema.safeParse({ ...report, guard: { ...row, x: 1 } }).success,
    ).toBe(false);
  });
});

describe('guardrailStatsResponseSchema', () => {
  it('is the GuardrailStatsDto', () => {
    expect(
      guardrailStatsResponseSchema.safeParse({
        aiEnabled: false,
        guardEnabled: false,
        guardBlocked: 0,
        outputRejected: 0,
        handoffs: { notInKnowledge: 0, needsHuman: 0, failedOrTimeout: 0, other: 0 },
        budgetReached: 0,
        nonText: 0,
      }).success,
    ).toBe(true);
  });
});

describe('webhook', () => {
  it('lets unknown LINE fields through but requires the ones it reads', () => {
    const body = {
      destination: 'U1',
      events: [
        {
          type: 'message',
          mode: 'active',
          timestamp: 1,
          webhookEventId: 'e1',
          source: { type: 'user', userId: 'U1', extra: true },
          message: { id: '1', type: 'text', text: 'hi', quoteToken: 'q' },
        },
        { type: 'follow' },
      ],
    };
    const parsed = lineWebhookBodySchema.safeParse(body);
    expect(parsed.success && parsed.data).toMatchObject({ destination: 'U1' });
    expect(lineWebhookBodySchema.safeParse({ events: [{ timestamp: 1 }] }).success).toBe(false);
    expect(lineWebhookBodySchema.safeParse({}).success).toBe(false);
    expect(webhookHeadersSchema.safeParse({ 'x-line-signature': 'abc', host: 'x' }).success).toBe(
      true,
    );
    expect(webhookHeadersSchema.safeParse({ 'x-line-signature': '' }).success).toBe(false);
  });
});

describe('index', () => {
  it('re-exports the limits the screens need from the domain', () => {
    expect(contracts.AI_DAILY_BUDGET_MAX_USD).toBe('10.00');
    expect(contracts.IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(contracts.VIDEO_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(contracts.PDF_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(contracts.ADMIN_TEXT_MAX_CHARS).toBe(5000);
  });

  it('re-exports the topic guard limits and normalizeGuardTopics', () => {
    expect(contracts.GUARD_MAX_TOPICS).toBe(20);
    expect(contracts.GUARD_TOPIC_MAX_CHARS).toBe(80);
    expect(contracts.GUARD_REFUSAL_MAX_CHARS).toBe(300);
    expect(contracts.GUARD_TEST_MAX_CHARS).toBe(1000);
    expect(contracts.GUARD_MODEL).toBe('claude-haiku-5-5');
    expect(contracts.GUARD_MAX_TOKENS).toBe(2000);
    expect(contracts.GUARD_TIMEOUT_MS).toBe(10_000);
    expect(contracts.GUARD_CONTEXT_TURNS).toBe(4);
    expect(contracts.normalizeGuardTopics([' a ', ''])).toEqual({ topics: ['a'], issue: null });
  });

  it('re-exports the new enum values', () => {
    expect(contracts.USAGE_KINDS).toContain('guard');
    expect(contracts.USAGE_OUTCOMES).toContain('blocked');
    expect(contracts.EVENT_CODES).toContain('guard.blocked');
    expect(contracts.ERROR_CODES).toContain('settings.guard_topics_required');
    expect(contracts.ERROR_CODES).toContain('settings.guard_rate_limited');
  });
});
