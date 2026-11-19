import { beforeEach, describe, expect, it } from 'vitest';
import { AI_MAX_TOKENS, formatPromptNow } from '@/core/domain';
import type { AiModelId } from '@/core/domain';
import type { ChatModelRequest } from '@/core/ports';
import { describeChatModelSuite } from '@/adapters/fakes';
import { ADAPTER_TEST_STUB_URL } from '../../../test-support/adapters.constants';
import { createClaudeChatModel } from './claude-chat-model.adapter';
import { CLAUDE_FALLBACK_BETA } from './claude.constants';
import {
  createStubControl,
  refusedBaseUrl,
  STUB_ANTHROPIC_KEY,
  STUB_ERRORS,
} from './claude-stub.test-helper';

const stubControl = createStubControl(ADAPTER_TEST_STUB_URL);
const STUB_ANTHROPIC_BASE_URL = stubControl.baseURL;

const makeChatModel = () =>
  createClaudeChatModel({ apiKey: STUB_ANTHROPIC_KEY, baseURL: STUB_ANTHROPIC_BASE_URL });

describeChatModelSuite(async () => {
  await stubControl.reset();
  const chatModel = makeChatModel();
  return {
    chatModel,
    async arrange(scenario) {
      switch (scenario.kind) {
        case 'completed':
          // Every completed answer carries a thinking block first, which the adapter must skip.
          await stubControl.nextReply({ json: scenario.output, withThinkingBlock: true });
          return;
        case 'invalid_output':
          await stubControl.nextReply({ json: { reply: 'ค่ะ', needsAdmin: 'no' } });
          return;
        case 'refused':
          await stubControl.nextReply({ text: '', stopReason: 'refusal' });
          return;
        case 'truncated':
          await stubControl.nextReply({ text: '{"reply":"เปิด', stopReason: 'max_tokens' });
          return;
        case 'error':
          await stubControl.failNext(STUB_ERRORS[scenario.code]);
          return;
      }
    },
  };
});

const request = (overrides: Partial<ChatModelRequest> = {}): ChatModelRequest => ({
  model: 'claude-opus-5-5',
  systemInstructions: 'คุณคือผู้ช่วยของร้าน',
  knowledgeText: '<knowledge>\nเปิด 9 โมง\n</knowledge>',
  history: [
    { role: 'customer', text: 'สวัสดีค่ะ' },
    { role: 'assistant', text: 'สวัสดีค่ะ ยินดีต้อนรับ' },
    { role: 'customer', text: 'เปิดกี่โมงคะ' },
  ],
  now: new Date('2026-11-18T07:32:00Z'),
  maxTokens: AI_MAX_TOKENS,
  ...overrides,
});

const lastRequest = () => stubControl.lastRequest();

describe('createClaudeChatModel request', () => {
  beforeEach(async () => {
    await stubControl.reset();
  });

  it('sends the request layout of ai-prompt section 3', async () => {
    const result = await makeChatModel().generateReply(request());
    expect(result.ok).toBe(true);
    const { body, endpoint, purpose } = await lastRequest();
    expect(endpoint).toBe('messages');
    expect(purpose).toBe('reply');
    expect(body['model']).toBe('claude-opus-5-5');
    expect(body['max_tokens']).toBe(AI_MAX_TOKENS);
    expect(body['system']).toEqual([
      { type: 'text', text: 'คุณคือผู้ช่วยของร้าน' },
      {
        type: 'text',
        text: '<knowledge>\nเปิด 9 โมง\n</knowledge>',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(body['messages']).toEqual([
      { role: 'user', content: 'สวัสดีค่ะ' },
      { role: 'assistant', content: 'สวัสดีค่ะ ยินดีต้อนรับ' },
      { role: 'user', content: 'เปิดกี่โมงคะ' },
      { role: 'system', content: formatPromptNow(new Date('2026-11-18T07:32:00Z')) },
    ]);
    expect(body['output_config']).toEqual({
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            needsAdmin: { type: 'boolean' },
            handoffReason: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['not_in_knowledge', 'needs_human_action', 'unsafe_or_offtopic', 'other'],
                },
                { type: 'null' },
              ],
            },
          },
          required: ['reply', 'needsAdmin', 'handoffReason'],
          additionalProperties: false,
        },
      },
    });
    for (const absent of ['temperature', 'top_p', 'top_k', 'thinking', 'tools', 'stream']) {
      expect(body).not.toHaveProperty(absent);
    }
  });

  // ADR 0021: a top-level automatic breakpoint would sit on the per-minute time message and only
  // ever write to the cache, so the knowledge block carries the one and only marker.
  it('sends exactly one cache_control marker, on the knowledge block', async () => {
    await makeChatModel().generateReply(request());
    const { body } = await lastRequest();
    expect(body).not.toHaveProperty('cache_control');
    expect(JSON.stringify(body).match(/"cache_control"/g)).toHaveLength(1);
    expect(body['system']).toEqual([
      expect.not.objectContaining({ cache_control: expect.anything() as unknown }),
      expect.objectContaining({ cache_control: { type: 'ephemeral' } }),
    ]);
  });

  it('asks for the server-side fallback on Opus', async () => {
    await makeChatModel().generateReply(request({ model: 'claude-opus-5-5' }));
    const { body, headers } = await lastRequest();
    expect(body['fallbacks']).toBe('default');
    expect(body).not.toHaveProperty('betas');
    expect(headers.anthropicBeta?.split(',')).toContain(CLAUDE_FALLBACK_BETA);
  });

  // Sonnet 5.5 replies leave the fallback out: see usesServerFallback in claude.mapper.ts.
  it.each<AiModelId>(['claude-haiku-5-5', 'claude-sonnet-5-5'])(
    'sends neither betas nor fallbacks on %s',
    async (model) => {
      await makeChatModel().generateReply(request({ model }));
      const { body, headers } = await lastRequest();
      expect(body).not.toHaveProperty('fallbacks');
      expect(body).not.toHaveProperty('betas');
      expect(headers.anthropicBeta).toBeUndefined();
    },
  );

  it('sends the API key as a bearer token and an API version', async () => {
    await makeChatModel().generateReply(request());
    const { headers } = await lastRequest();
    expect(headers.authorization).toBe('bearer');
    expect(headers.anthropicVersion).toEqual(expect.any(String));
  });
});

describe('createClaudeChatModel response', () => {
  beforeEach(async () => {
    await stubControl.reset();
  });

  it('reports the served model and every usage field', async () => {
    await stubControl.nextReply({
      json: { reply: 'ได้ค่ะ', needsAdmin: false, handoffReason: null },
      model: 'claude-opus-5',
      usage: {
        input_tokens: 11,
        output_tokens: 22,
        cache_read_input_tokens: 33,
        cache_creation_input_tokens: 44,
      },
    });
    const result = await makeChatModel().generateReply(request());
    expect(result).toEqual({
      ok: true,
      value: {
        stop: 'completed',
        output: { reply: 'ได้ค่ะ', needsAdmin: false, handoffReason: null },
        usage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheWriteTokens: 44 },
        servedModel: 'claude-opus-5',
      },
    });
  });

  it.each([
    ['text that is not JSON', 'เปิด 9 โมงค่ะ'],
    [
      'an extra field',
      JSON.stringify({ reply: 'x', needsAdmin: false, handoffReason: null, a: 1 }),
    ],
    ['an unknown reason', JSON.stringify({ reply: 'x', needsAdmin: true, handoffReason: 'busy' })],
  ])('returns output null for %s', async (_label, text) => {
    await stubControl.nextReply({ text });
    const result = await makeChatModel().generateReply(request());
    expect(result.ok && result.value.stop).toBe('completed');
    expect(result.ok && result.value.output).toBeNull();
  });

  it('returns output null with stop completed for a stop reason other than end_turn', async () => {
    await stubControl.nextReply({
      json: { reply: 'x', needsAdmin: false, handoffReason: null },
      stopReason: 'pause_turn',
    });
    const result = await makeChatModel().generateReply(request());
    expect(result.ok && result.value).toMatchObject({ stop: 'completed', output: null });
  });

  it('drops a handoff reason when needsAdmin is false', async () => {
    await stubControl.nextReply({
      json: { reply: 'x', needsAdmin: false, handoffReason: 'other' },
    });
    const result = await makeChatModel().generateReply(request());
    expect(result.ok && result.value.output?.handoffReason).toBeNull();
  });

  it('returns ai.unavailable when the connection is refused, since nothing was sent', async () => {
    const chatModel = createClaudeChatModel({
      apiKey: STUB_ANTHROPIC_KEY,
      baseURL: await refusedBaseUrl(),
    });
    const result = await chatModel.generateReply(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ai.unavailable');
  });

  it('returns ai.auth_failed for a key the API rejects', async () => {
    const chatModel = createClaudeChatModel({
      apiKey: 'stub-invalid-key',
      baseURL: STUB_ANTHROPIC_BASE_URL,
    });
    const result = await chatModel.generateReply(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ai.auth_failed');
  });
});
