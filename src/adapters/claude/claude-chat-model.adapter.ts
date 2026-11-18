import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ChatOutput } from '@/core/domain';
import { formatPromptNow, MODEL_HANDOFF_REASONS, ok } from '@/core/domain';
import type { ChatModel, ChatModelRequest } from '@/core/ports';
import { CLAUDE_REPLY_MAX_RETRIES, CLAUDE_REPLY_TIMEOUT_MS } from './claude.constants';
import {
  type ClaudeAdapterOptions,
  createClaudeClient,
  fallbackParams,
  mapClaudeError,
  readMessage,
  usesServerFallback,
} from './claude.mapper';

/** ai-prompt 5.1: the schema sent in `output_config.format`. No length limits (checked by zod). */
export const CHAT_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    needsAdmin: { type: 'boolean' },
    handoffReason: {
      anyOf: [{ type: 'string', enum: [...MODEL_HANDOFF_REASONS] }, { type: 'null' }],
    },
  },
  required: ['reply', 'needsAdmin', 'handoffReason'],
  additionalProperties: false,
} as const;

/** ai-prompt 5.2. The reply length is checked later by sanitizeAiReply in the core. */
const chatOutputSchema = z.strictObject({
  reply: z.string(),
  needsAdmin: z.boolean(),
  handoffReason: z.enum(MODEL_HANDOFF_REASONS).nullable(),
});

/** Model text (untrusted) to ChatOutput, or null when it is not JSON matching the schema. */
export const parseChatOutput = (text: string): ChatOutput | null => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = chatOutputSchema.safeParse(json);
  if (!parsed.success) return null;
  const { reply, needsAdmin, handoffReason } = parsed.data;
  // ai-prompt 5.2: needsAdmin true without a reason means `other`; no reason when false.
  return { reply, needsAdmin, handoffReason: needsAdmin ? (handoffReason ?? 'other') : null };
};

/**
 * The request of domain-and-ports "คำขอของ ChatModel.generateReply" and ai-prompt section 3, without
 * the fallback fields. Stable parts first so prompt caching can reuse them.
 */
export const buildChatParams = (
  req: ChatModelRequest,
): Anthropic.Messages.MessageCreateParamsNonStreaming => ({
  model: req.model,
  max_tokens: req.maxTokens,
  // One explicit breakpoint on the knowledge block, so the instructions and knowledge stay cached
  // while the 20-message history moves on. No top-level automatic cache_control: its breakpoint
  // would land on the per-minute time message at the end and only ever pay for cache writes.
  system: [
    { type: 'text', text: req.systemInstructions },
    { type: 'text', text: req.knowledgeText, cache_control: { type: 'ephemeral' } },
  ],
  messages: [
    ...req.history.map((turn): Anthropic.Messages.MessageParam => ({
      role: turn.role === 'customer' ? 'user' : 'assistant',
      content: turn.text,
    })),
    // The current time goes last as a mid-conversation system message, not in `system`, so the
    // cached prefix does not change every minute.
    { role: 'system', content: formatPromptNow(req.now) },
  ],
  output_config: {
    effort: 'low',
    format: { type: 'json_schema', schema: CHAT_OUTPUT_JSON_SCHEMA },
  },
});

export const createClaudeChatModel = (options: ClaudeAdapterOptions): ChatModel => {
  const client = createClaudeClient(options, {
    timeoutMs: CLAUDE_REPLY_TIMEOUT_MS,
    maxRetries: CLAUDE_REPLY_MAX_RETRIES,
  });

  const send = (req: ChatModelRequest) => {
    const params = buildChatParams(req);
    return usesServerFallback(req.model, 'reply')
      ? client.beta.messages.create({ ...params, ...fallbackParams() })
      : client.messages.create(params);
  };

  return {
    async generateReply(req) {
      try {
        const message = await send(req);
        const { stop, text, usage, servedModel } = readMessage(message);
        return ok({
          stop,
          output: text === null ? null : parseChatOutput(text),
          usage,
          servedModel,
        });
      } catch (error) {
        return mapClaudeError(error);
      }
    },
  };
};
