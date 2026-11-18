import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { joinTextBlocks, mapClaudeError, readMessage, usesServerFallback } from './claude.mapper';

const message = (content: unknown[], stopReason = 'end_turn'): Anthropic.Beta.BetaMessage =>
  // Only the fields the mapper reads; the full BetaMessage has many unrelated required fields.
  ({
    model: 'claude-opus-5',
    stop_reason: stopReason,
    content,
    usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: null },
  }) as unknown as Anthropic.Beta.BetaMessage;

const apiError = (status: number, headers: Record<string, string> = {}) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'x', message: 'secret prompt text' } },
    'secret prompt text',
    new Headers(headers),
  );

describe('joinTextBlocks', () => {
  it('joins text blocks and skips thinking blocks', () => {
    const text = joinTextBlocks(
      message([
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ]),
    );
    expect(text).toBe('{"a":1}');
  });

  it('keeps only the text after the last fallback block', () => {
    const text = joinTextBlocks(
      message([
        { type: 'text', text: 'partial from the declined model' },
        { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
        { type: 'text', text: 'answer' },
      ]),
    );
    expect(text).toBe('answer');
  });
});

describe('readMessage', () => {
  it('turns missing cache counts into 0 and reads the served model', () => {
    expect(readMessage(message([{ type: 'text', text: 'x' }]))).toEqual({
      stop: 'completed',
      text: 'x',
      usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      servedModel: 'claude-opus-5',
    });
  });

  it.each([
    ['refusal', 'refused'],
    ['max_tokens', 'truncated'],
    ['tool_use', 'completed'],
    ['model_context_window_exceeded', 'completed'],
  ])('maps stop_reason %s to %s with no text', (stopReason, stop) => {
    const read = readMessage(message([{ type: 'text', text: '{}' }], stopReason));
    expect(read.stop).toBe(stop);
    expect(read.text).toBeNull();
  });
});

describe('toTokenUsage after a server-side fallback', () => {
  // Shaped exactly as Anthropic.Beta.BetaUsage of SDK 1.10.0: Opus 5.5 declined, Opus 5 served.
  // The top level repeats only the serving attempt.
  const usage: Anthropic.Beta.BetaUsage = {
    cache_creation: null,
    cache_creation_input_tokens: 40,
    cache_read_input_tokens: 300,
    fallback_credit: null,
    inference_geo: null,
    input_tokens: 1000,
    iterations: [
      {
        type: 'message',
        model: 'claude-opus-5-5',
        cache_creation: null,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 200,
        input_tokens: 900,
        output_tokens: 7,
      },
      {
        type: 'fallback_message',
        model: 'claude-opus-5',
        cache_creation: null,
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 300,
        input_tokens: 1000,
        output_tokens: 80,
      },
    ],
    output_tokens: 80,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: 'standard',
    speed: 'standard',
  };
  const served = (u: Anthropic.Beta.BetaUsage) =>
    // Only the fields the mapper reads; the full BetaMessage has many unrelated required fields.
    ({
      model: 'claude-opus-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'x' }],
      usage: u,
    }) as unknown as Anthropic.Beta.BetaMessage;

  it('sums every billed attempt and keeps the model of the final message', () => {
    expect(readMessage(served(usage))).toMatchObject({
      usage: { inputTokens: 1900, outputTokens: 87, cacheReadTokens: 500, cacheWriteTokens: 90 },
      servedModel: 'claude-opus-5',
    });
  });

  it.each([
    ['null', null],
    ['empty', []],
  ])('reads the top level when iterations are %s', (_label, iterations) => {
    expect(readMessage(served({ ...usage, iterations })).usage).toEqual({
      inputTokens: 1000,
      outputTokens: 80,
      cacheReadTokens: 300,
      cacheWriteTokens: 40,
    });
  });
});

describe('mapClaudeError', () => {
  it.each([
    [400, 'ai.bad_request'],
    [401, 'ai.auth_failed'],
    [403, 'ai.auth_failed'],
    [404, 'ai.bad_request'],
    [408, 'ai.unavailable'],
    [409, 'ai.unavailable'],
    [413, 'ai.bad_request'],
    [429, 'ai.rate_limited'],
    [500, 'ai.unavailable'],
    [529, 'ai.unavailable'],
  ])('maps status %i to %s', (status, code) => {
    const result = mapClaudeError(apiError(status));
    expect(!result.ok && result.error.code).toBe(code);
  });

  it('never copies the API message into the detail', () => {
    const result = mapClaudeError(apiError(400));
    expect(!result.ok && result.error.detail).not.toContain('secret');
  });

  it('carries retry-after of a rate limit', () => {
    const result = mapClaudeError(apiError(429, { 'retry-after': '7' }));
    expect(!result.ok && result.error.retryAfterSeconds).toBe(7);
  });

  it.each([
    new Anthropic.APIConnectionError({ message: 'down' }),
    new Anthropic.APIConnectionTimeoutError(),
    new Anthropic.AnthropicError('stream ended without a message'),
  ])('maps %s to ai.unavailable', (error) => {
    const result = mapClaudeError(error);
    expect(!result.ok && result.error.code).toBe('ai.unavailable');
  });

  it('rethrows errors that do not come from the SDK', () => {
    const bug = new TypeError('bug');
    expect(() => mapClaudeError(bug)).toThrow(bug);
  });
});

describe('usesServerFallback', () => {
  it('is on for Opus 5.5 and off for Haiku 5.5', () => {
    for (const use of ['reply', 'extract'] as const) {
      expect(usesServerFallback('claude-opus-5-5', use)).toBe(true);
      expect(usesServerFallback('claude-haiku-5-5', use)).toBe(false);
    }
  });

  it('is on for Sonnet 5.5 extraction only', () => {
    expect(usesServerFallback('claude-sonnet-5-5', 'extract')).toBe(true);
    expect(usesServerFallback('claude-sonnet-5-5', 'reply')).toBe(false);
  });
});
