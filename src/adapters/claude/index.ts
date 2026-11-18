// Only the adapter factories and their options leave this folder; never the SDK client.
export { createClaudeChatModel } from './claude-chat-model.adapter';
export { createClaudeDocumentExtractor } from './claude-document-extractor.adapter';
export { createClaudeTopicGuard } from './claude-topic-guard.adapter';
export type { ClaudeAdapterOptions } from './claude.mapper';
