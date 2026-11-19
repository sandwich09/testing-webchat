import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { TopicVerdict } from '@/core/domain';
import { buildGuardClassifierPrompt, GUARD_TIMEOUT_MS, ok } from '@/core/domain';
import type { TopicGuard, TopicGuardRequest } from '@/core/ports';
import { CLAUDE_GUARD_MAX_RETRIES } from './claude.constants';
import {
  callOptions,
  type ClaudeAdapterOptions,
  createClaudeClient,
  mapClaudeError,
  readMessage,
} from './claude.mapper';

/** ai-prompt 9.3: the schema sent in `output_config.format`. The stub keys on `allowed`. */
export const TOPIC_VERDICT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    matchedTopic: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['allowed', 'matchedTopic'],
  additionalProperties: false,
} as const;

/** ai-prompt 9.3, checked again on our side. */
const topicVerdictSchema = z.strictObject({
  allowed: z.boolean(),
  matchedTopic: z.string().nullable(),
});

/** Model text (untrusted) to TopicVerdict, or null when it is not JSON matching the schema. */
export const parseTopicVerdict = (text: string): TopicVerdict | null => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = topicVerdictSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

/**
 * domain-and-ports "คำขอของ TopicGuard.classify" and ai-prompt 9.2: one system text, one user
 * turn, structured output at low effort. No thinking, sampling, tools, stream, cache_control,
 * betas or fallbacks (Haiku 5.5 has no server-side fallback).
 */
export const buildGuardParams = (
  req: TopicGuardRequest,
): Anthropic.Messages.MessageCreateParamsNonStreaming => {
  const { system, userText } = buildGuardClassifierPrompt({
    topics: req.topics,
    message: req.message,
    context: req.context,
  });
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    system,
    messages: [{ role: 'user', content: userText }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: TOPIC_VERDICT_JSON_SCHEMA },
    },
  };
};

export const createClaudeTopicGuard = (options: ClaudeAdapterOptions): TopicGuard => {
  // The client timeout is only a default: every request passes its own `timeoutMs`.
  const client = createClaudeClient(options, {
    timeoutMs: GUARD_TIMEOUT_MS,
    maxRetries: CLAUDE_GUARD_MAX_RETRIES,
  });

  return {
    async classify(req) {
      try {
        const message = await client.messages.create(
          buildGuardParams(req),
          callOptions({ timeoutMs: req.timeoutMs, maxRetries: CLAUDE_GUARD_MAX_RETRIES }),
        );
        // readMessage checks stop_reason before it reads any content.
        const { stop, text, usage, servedModel } = readMessage(message);
        return ok({
          stop,
          verdict: text === null ? null : parseTopicVerdict(text),
          usage,
          servedModel,
        });
      } catch (error) {
        return mapClaudeError(error);
      }
    },
  };
};
