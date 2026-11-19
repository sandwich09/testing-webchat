// Only repository and adapter factories leave this folder; never the client or generated types.
export { getPrismaClient } from './prisma-client';
export { createContactRepository } from './contact.repository';
export { createContactNoteRepository } from './contact-note.repository';
export { createMessageRepository } from './message.repository';
export { createSettingsRepository } from './settings.repository';
export { createKnowledgeRepository } from './knowledge.repository';
export { createUsageRepository } from './usage.repository';
export { createWebhookEventRepository } from './webhook-event.repository';
export { createRateLimitRepository } from './rate-limit.repository';
export { createKnowledgeSource } from './knowledge-source.adapter';
