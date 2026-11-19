import { describe, expect, it } from 'vitest';
import type { DocumentId, UsageId } from './ids';
import { isNoResponse, noResponseUsage } from './usage.logic';

describe('noResponseUsage', () => {
  it('records a failed call with zero tokens and cost and the ai.no_response code', () => {
    const at = new Date('2026-11-18T03:00:00Z');
    const row = noResponseUsage({
      id: 'u-1' as UsageId,
      kind: 'ingest',
      contactId: null,
      documentId: 'd-1' as DocumentId,
      provider: 'claude',
      model: 'claude-opus-5-5',
      createdAt: at,
    });
    expect(row).toEqual({
      id: 'u-1',
      kind: 'ingest',
      contactId: null,
      messageId: null,
      documentId: 'd-1',
      provider: 'claude',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cost: 0n,
      outcome: 'failed',
      error: 'ai.no_response',
      createdAt: at,
    });
  });

  it('gives every row its own usage object', () => {
    const base = {
      id: 'u' as UsageId,
      kind: 'reply' as const,
      contactId: null,
      documentId: null,
      provider: 'claude' as const,
      model: 'm',
      createdAt: new Date(0),
    };
    expect(noResponseUsage(base).usage).not.toBe(noResponseUsage(base).usage);
  });
});

describe('isNoResponse', () => {
  it('is true for ai.no_response only', () => {
    expect(isNoResponse('ai.no_response')).toBe(true);
    expect(isNoResponse('ai.unavailable')).toBe(false);
    expect(isNoResponse('ai.rate_limited')).toBe(false);
  });
});
