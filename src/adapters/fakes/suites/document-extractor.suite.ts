import { describe, expect, it } from 'vitest';
import type { DocumentExtractor, ExtractRequest } from '@/core/ports';

export type DocumentExtractorErrorCode =
  'ai.unavailable' | 'ai.rate_limited' | 'ai.auth_failed' | 'ai.bad_request';

/** What the provider should answer to the next call. */
export type DocumentExtractorScenario =
  /** The provider answers a conversion with this raw text (before the clean-up of ai-prompt 7.3). */
  | { kind: 'extract_text'; modelText: string }
  | { kind: 'extract_refused' }
  | { kind: 'extract_truncated' }
  | { kind: 'extract_error'; code: DocumentExtractorErrorCode }
  | { kind: 'count_tokens_error'; code: DocumentExtractorErrorCode };

/**
 * `arrange` sets up the next answer: the fake queues it, the real adapter tells the Anthropic stub.
 * It applies to the next call only.
 */
export interface DocumentExtractorHarness {
  extractor: DocumentExtractor;
  arrange(scenario: DocumentExtractorScenario): Promise<void>;
}

const request = (): ExtractRequest => ({
  model: 'claude-opus-5-5',
  pdf: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
  maxTokens: 1000,
});

const extractOk = async (h: DocumentExtractorHarness, modelText: string) => {
  await h.arrange({ kind: 'extract_text', modelText });
  const result = await h.extractor.extract(request());
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('extract failed');
  return result.value;
};

/** Runs every row of the DocumentExtractor table in domain-and-ports against the subject. */
export const describeDocumentExtractorSuite = (
  makeHarness: () => DocumentExtractorHarness | Promise<DocumentExtractorHarness>,
): void => {
  describe('DocumentExtractor.extract', () => {
    it('keeps the page separators and counts them', async () => {
      const h = await makeHarness();
      const raw = '=== หน้า 1 ===\nเมนูกาแฟ\n=== หน้า 2 ===\nราคา 60 บาท';
      const value = await extractOk(h, raw);
      expect(value.stop).toBe('completed');
      expect(value.text).toBe(raw);
      expect(value.pageCount).toBe(2);
      expect(value.usage.inputTokens).toEqual(expect.any(Number));
      expect(value.servedModel.length).toBeGreaterThan(0);
    });

    it('returns pageCount null when there is no separator', async () => {
      const value = await extractOk(await makeHarness(), 'ข้อความไม่มีตัวคั่น');
      expect(value.text).toBe('ข้อความไม่มีตัวคั่น');
      expect(value.pageCount).toBeNull();
    });

    it('converts CRLF to LF, trims the ends and collapses runs of blank lines to one', async () => {
      const value = await extractOk(
        await makeHarness(),
        '\r\n  === หน้า 1 ===\r\nก\r\n\r\n\r\n\r\nข\r\n\r\n',
      );
      expect(value.text).toBe('=== หน้า 1 ===\nก\n\nข');
      expect(value.pageCount).toBe(1);
    });

    it.each(['EMPTY_DOCUMENT', '', '  \r\n  '])(
      'returns text null with stop completed for the empty text %j',
      async (modelText) => {
        const value = await extractOk(await makeHarness(), modelText);
        expect(value.stop).toBe('completed');
        expect(value.text).toBeNull();
        expect(value.pageCount).toBeNull();
      },
    );

    it('returns ok with usage and no text for a refusal', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'extract_refused' });
      const result = await h.extractor.extract(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('refused');
      expect(result.value.text).toBeNull();
      expect(result.value.pageCount).toBeNull();
      expect(result.value.usage.outputTokens).toEqual(expect.any(Number));
    });

    it('returns ok with usage and no text for a truncated answer', async () => {
      const h = await makeHarness();
      await h.arrange({ kind: 'extract_truncated' });
      const result = await h.extractor.extract(request());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stop).toBe('truncated');
      expect(result.value.text).toBeNull();
      expect(result.value.usage.outputTokens).toEqual(expect.any(Number));
    });

    it.each<DocumentExtractorErrorCode>([
      'ai.unavailable',
      'ai.rate_limited',
      'ai.auth_failed',
      'ai.bad_request',
    ])('returns %s only when the provider gave no answer', async (code) => {
      const h = await makeHarness();
      await h.arrange({ kind: 'extract_error', code });
      const result = await h.extractor.extract(request());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    });
  });

  describe('DocumentExtractor.countTokens', () => {
    it('returns a non-negative integer count that grows with the text', async () => {
      const h = await makeHarness();
      const short = await h.extractor.countTokens('claude-opus-5-5', 'สวัสดี');
      const long = await h.extractor.countTokens('claude-opus-5-5', 'สวัสดี '.repeat(200));
      expect(short.ok && long.ok).toBe(true);
      if (!short.ok || !long.ok) return;
      expect(Number.isInteger(short.value)).toBe(true);
      expect(short.value).toBeGreaterThanOrEqual(0);
      expect(long.value).toBeGreaterThan(short.value);
    });

    it.each<DocumentExtractorErrorCode>([
      'ai.unavailable',
      'ai.rate_limited',
      'ai.auth_failed',
      'ai.bad_request',
    ])('returns %s when the provider does not count', async (code) => {
      const h = await makeHarness();
      await h.arrange({ kind: 'count_tokens_error', code });
      const result = await h.extractor.countTokens('claude-opus-5-5', 'x');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    });
  });
};
