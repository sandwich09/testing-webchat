import type { ContactFilter } from '@/contracts';

/** Every TanStack Query key of the app (ui-screens 7.1). */
export const qk = {
  settings: () => ['settings'] as const,
  contacts: (p: { filter: ContactFilter; q: string }) => ['contacts', p] as const,
  contact: (id: string) => ['contact', id] as const,
  messages: (id: string) => ['messages', id] as const,
  contactNotes: (id: string) => ['contact-notes', id] as const,
  kbDocuments: () => ['kb-documents'] as const,
  kbDocument: (id: string) => ['kb-document', id] as const,
  usage: (month: string) => ['usage', month] as const,
  usageDetail: (contactId: string, month: string) => ['usage-detail', contactId, month] as const,
  systemStatus: () => ['system-status'] as const,
};

/** Prefixes that match every key of one kind, for `invalidateQueries` and `setQueriesData`. */
export const qkAll = {
  contacts: ['contacts'] as const,
  contact: ['contact'] as const,
  messages: ['messages'] as const,
  usage: ['usage'] as const,
};
