import { beforeEach, describe, expect, it } from 'vitest';
import { AI_EXTRACT_MAX_TOKENS } from '@/core/domain';
import type { AiModelId } from '@/core/domain';
import type { ExtractRequest } from '@/core/ports';
import { describeDocumentExtractorSuite } from '@/adapters/fakes';
import { ADAPTER_TEST_STUB_URL } from '../../../test-support/adapters.constants';
import {
  createClaudeDocumentExtractor,
  EXTRACT_SYSTEM_PROMPT,
  EXTRACT_USER_TEXT,
} from './claude-document-extractor.adapter';
import { CLAUDE_FALLBACK_BETA } from './claude.constants';
import { createStubControl, STUB_ANTHROPIC_KEY, STUB_ERRORS } from './claude-stub.test-helper';

const stubControl = createStubControl(ADAPTER_TEST_STUB_URL);
const STUB_ANTHROPIC_BASE_URL = stubControl.baseURL;

const makeExtractor = () =>
  createClaudeDocumentExtractor({ apiKey: STUB_ANTHROPIC_KEY, baseURL: STUB_ANTHROPIC_BASE_URL });

describeDocumentExtractorSuite(async () => {
  await stubControl.reset();
  const extractor = makeExtractor();
  return {
    extractor,
    async arrange(scenario) {
      switch (scenario.kind) {
        case 'extract_text':
          await stubControl.nextReply({ kind: 'extract', text: scenario.modelText });
          return;
        case 'extract_refused':
          await stubControl.nextReply({ kind: 'extract', text: '', stopReason: 'refusal' });
          return;
        case 'extract_truncated':
          await stubControl.nextReply({
            kind: 'extract',
            text: '=== หน้า 1 ===\nเมนู',
            stopReason: 'max_tokens',
          });
          return;
        case 'extract_error':
          await stubControl.failNext(STUB_ERRORS[scenario.code]);
          return;
        case 'count_tokens_error':
          await stubControl.failNext({ ...STUB_ERRORS[scenario.code], endpoint: 'count_tokens' });
          return;
      }
    },
  };
});

const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const request = (overrides: Partial<ExtractRequest> = {}): ExtractRequest => ({
  model: 'claude-opus-5-5',
  pdf: PDF,
  maxTokens: AI_EXTRACT_MAX_TOKENS,
  ...overrides,
});

const lastRequest = () => stubControl.lastRequest();

describe('createClaudeDocumentExtractor request', () => {
  beforeEach(async () => {
    await stubControl.reset();
  });

  it('streams the conversion request of ai-prompt 7.1', async () => {
    const result = await makeExtractor().extract(request());
    expect(result.ok).toBe(true);
    const { body, endpoint, purpose } = await lastRequest();
    expect(endpoint).toBe('messages');
    expect(purpose).toBe('extract');
    expect(body['stream']).toBe(true);
    expect(body['model']).toBe('claude-opus-5-5');
    expect(body['max_tokens']).toBe(AI_EXTRACT_MAX_TOKENS);
    expect(body['system']).toBe(EXTRACT_SYSTEM_PROMPT);
    expect(body['output_config']).toEqual({ effort: 'low' });
    expect(body['messages']).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: Buffer.from(PDF).toString('base64'),
            },
          },
          { type: 'text', text: EXTRACT_USER_TEXT },
        ],
      },
    ]);
    for (const absent of ['temperature', 'top_p', 'top_k', 'thinking', 'tools']) {
      expect(body).not.toHaveProperty(absent);
    }
  });

  it.each<AiModelId>(['claude-opus-5-5', 'claude-sonnet-5-5'])(
    'asks for the server-side fallback on %s',
    async (model) => {
      await makeExtractor().extract(request({ model }));
      const { body, headers } = await lastRequest();
      expect(body['fallbacks']).toBe('default');
      expect(headers.anthropicBeta?.split(',')).toContain(CLAUDE_FALLBACK_BETA);
    },
  );

  it('sends neither betas nor fallbacks on Haiku', async () => {
    await makeExtractor().extract(request({ model: 'claude-haiku-5-5' }));
    const { body, headers } = await lastRequest();
    expect(body).not.toHaveProperty('fallbacks');
    expect(body).not.toHaveProperty('betas');
    expect(headers.anthropicBeta).toBeUndefined();
  });

  it('counts tokens of the text as one user turn on the same model', async () => {
    const result = await makeExtractor().countTokens('claude-sonnet-5-5', 'abcdefgh');
    // The stub counts one token per 4 characters.
    expect(result).toEqual({ ok: true, value: 2 });
    const { body, endpoint, purpose } = await lastRequest();
    expect(endpoint).toBe('count-tokens');
    expect(purpose).toBe('count_tokens');
    expect(body).toEqual({
      model: 'claude-sonnet-5-5',
      messages: [{ role: 'user', content: 'abcdefgh' }],
    });
  });
});

describe('createClaudeDocumentExtractor response', () => {
  beforeEach(async () => {
    await stubControl.reset();
  });

  it('skips a thinking block and reports served model and usage', async () => {
    await stubControl.nextReply({
      kind: 'extract',
      text: '=== หน้า 1 ===\nก',
      withThinkingBlock: true,
      model: 'claude-opus-4-8',
      usage: {
        input_tokens: 5,
        output_tokens: 6,
        cache_read_input_tokens: 7,
        cache_creation_input_tokens: 8,
      },
    });
    const result = await makeExtractor().extract(request());
    expect(result).toEqual({
      ok: true,
      value: {
        stop: 'completed',
        text: '=== หน้า 1 ===\nก',
        pageCount: 1,
        usage: { inputTokens: 5, outputTokens: 6, cacheReadTokens: 7, cacheWriteTokens: 8 },
        servedModel: 'claude-opus-4-8',
      },
    });
  });

  it('applies a count_tokens failure to count_tokens only', async () => {
    await stubControl.failNext({ ...STUB_ERRORS['ai.bad_request'], endpoint: 'count_tokens' });
    const extractor = makeExtractor();
    const extracted = await extractor.extract(request());
    const counted = await extractor.countTokens('claude-opus-5-5', 'x');
    expect(extracted.ok).toBe(true);
    expect(!counted.ok && counted.error.code).toBe('ai.bad_request');
  });

  it('returns ai.unavailable when the API cannot be reached', async () => {
    const extractor = createClaudeDocumentExtractor({
      apiKey: STUB_ANTHROPIC_KEY,
      baseURL: 'http://127.0.0.1:9/anthropic',
    });
    const extracted = await extractor.extract(request());
    const counted = await extractor.countTokens('claude-opus-5-5', 'x');
    expect(!extracted.ok && extracted.error.code).toBe('ai.unavailable');
    expect(!counted.ok && counted.error.code).toBe('ai.unavailable');
  });
});
