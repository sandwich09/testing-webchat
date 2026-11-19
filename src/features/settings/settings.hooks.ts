'use client';

// Data hooks of the settings page (ui-screens 7.1 and 7.7). `useSettings` and `useCannedReplies`
// are shared with the chat page and live in src/common/common.hooks.ts.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { nextPollDelay } from '@/common/common.logic';
import { pollController, trackPoll, usePollingInterval } from '@/common/polling';
import { qk, qkAll } from '@/common/query-keys';
import type { SettingsDto } from '@/contracts';

import {
  createCannedReply,
  deleteCannedReply,
  deleteKbDocument,
  getKbDocument,
  getSystemStatus,
  getUsage,
  getUsageDetail,
  listKbDocuments,
  retryKbDocument,
  saveLineCredentials,
  testLineConnection,
  updateCannedReply,
  updateSettings,
  uploadKbDocument,
  type KbDocumentsList,
  type SettingsPatch,
} from './settings.api';
import { SYSTEM_STATUS_POLL_MS } from './settings.constants';

/** `usage` and `usage-detail` stay fresh this long (ui-screens 7.1). */
export const USAGE_STALE_MS = 60_000;

function invalidate(client: QueryClient, ...keys: readonly (readonly unknown[])[]): Promise<void> {
  return Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))).then(
    () => undefined,
  );
}

// ---------------------------------------------------------------------------
// AI and LINE (ui-screens 9.3, 9.4)
// ---------------------------------------------------------------------------

/**
 * PATCH /api/settings. The result replaces `qk.settings()`. A change of `aiEnabled` (the kill
 * switch) shows at once and comes back on failure; other fields keep what was typed until saved.
 */
export function useUpdateSettings() {
  const client = useQueryClient();
  const key = qk.settings();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => updateSettings(patch),
    onMutate: async (patch) => {
      if (patch.aiEnabled === undefined) return { previous: undefined };
      const aiEnabled = patch.aiEnabled;
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SettingsDto>(key);
      client.setQueryData<SettingsDto>(key, (old) =>
        old === undefined ? old : { ...old, ai: { ...old.ai, enabled: aiEnabled } },
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous !== undefined) client.setQueryData(key, context.previous);
    },
    onSuccess: (settings) => {
      applySavedSettings(client, settings);
    },
  });
}

/**
 * After a PATCH /api/settings (ui-screens 7.7): the answer replaces `qk.settings()`, and the
 * system status and the Guardrails panel load again because both show settings values.
 */
export function applySavedSettings(client: QueryClient, settings: SettingsDto): void {
  client.setQueryData(qk.settings(), settings);
  void client.invalidateQueries({ queryKey: qk.systemStatus() });
  void client.invalidateQueries({ queryKey: qk.guardrails() });
}

/** PUT /api/settings/line-credentials. Settings and system status load again afterwards. */
export function useSaveLineCredentials() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveLineCredentials,
    onSettled: () => invalidate(client, qk.settings(), qk.systemStatus()),
  });
}

/** POST /api/settings/line/test. Settings and system status load again afterwards. */
export function useTestLineConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: testLineConnection,
    onSettled: () => invalidate(client, qk.settings(), qk.systemStatus()),
  });
}

// ---------------------------------------------------------------------------
// Knowledge base (ui-screens 9.5 to 9.7)
// ---------------------------------------------------------------------------

/** Whether the list still has a file being converted, which keeps it polling. */
export function hasProcessingDocument(list: KbDocumentsList | undefined): boolean {
  return list?.documents.some((doc) => doc.status === 'processing') ?? false;
}

/** GET /api/knowledge/documents, polled only while a file is `processing`. */
export function useKbDocuments() {
  const { intervalMs } = usePollingInterval();
  return useQuery({
    queryKey: qk.kbDocuments(),
    queryFn: ({ signal }) => trackPoll(pollController, () => listKbDocuments(signal), signal),
    staleTime: 0,
    retry: 0,
    refetchInterval: (query) => (hasProcessingDocument(query.state.data) ? intervalMs : false),
    refetchIntervalInBackground: false,
  });
}

/** GET /api/knowledge/documents/:id for the text dialog. The text never changes, so it never goes stale. */
export function useKbDocument(id: string | null) {
  return useQuery({
    queryKey: qk.kbDocument(id ?? ''),
    queryFn: ({ signal }) => getKbDocument(id ?? '', signal),
    enabled: id !== null,
    staleTime: Infinity,
  });
}

function useKnowledgeMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => invalidate(client, qk.kbDocuments(), qkAll.usage),
  });
}

/** POST /api/knowledge/documents with the PDF. */
export function useUploadKbDocument() {
  return useKnowledgeMutation((file: File) => uploadKbDocument(file));
}

/** POST /api/knowledge/documents/:id/retry with the PDF chosen again. */
export function useRetryKbDocument() {
  return useKnowledgeMutation(({ id, file }: { id: string; file: File }) =>
    retryKbDocument(id, file),
  );
}

/** DELETE /api/knowledge/documents/:id */
export function useDeleteKbDocument() {
  return useKnowledgeMutation((id: string) => deleteKbDocument(id));
}

// ---------------------------------------------------------------------------
// Canned replies (ui-screens 9.8); the list itself is `useCannedReplies` in common.hooks.ts
// ---------------------------------------------------------------------------

function useCannedMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => invalidate(client, qk.cannedReplies()),
  });
}

/** POST /api/canned-replies */
export function useCreateCannedReply() {
  return useCannedMutation((body: { title: string; text: string }) => createCannedReply(body));
}

/** PATCH /api/canned-replies/:id */
export function useUpdateCannedReply() {
  return useCannedMutation(
    ({ id, ...body }: { id: string; title?: string; text?: string; sortOrder?: number }) =>
      updateCannedReply(id, body),
  );
}

/** DELETE /api/canned-replies/:id */
export function useDeleteCannedReply() {
  return useCannedMutation((id: string) => deleteCannedReply(id));
}

// ---------------------------------------------------------------------------
// Usage and system status (ui-screens 9.9 to 9.11)
// ---------------------------------------------------------------------------

/** GET /api/usage for one month (`YYYY-MM`); idle while the month is not known yet (empty). */
export function useUsage(month: string) {
  return useQuery({
    queryKey: qk.usage(month),
    queryFn: ({ signal }) => getUsage(month, signal),
    enabled: month !== '',
    staleTime: USAGE_STALE_MS,
  });
}

/** GET /api/usage/contacts/:id for the detail dialog; idle while no contact is chosen. */
export function useUsageDetail(contactId: string | null, month: string) {
  return useQuery({
    queryKey: qk.usageDetail(contactId ?? '', month),
    queryFn: ({ signal }) => getUsageDetail(contactId ?? '', month, signal),
    enabled: contactId !== null,
    staleTime: USAGE_STALE_MS,
  });
}

/** GET /api/system/status, polled every `SYSTEM_STATUS_POLL_MS` while the settings page is open. */
export function useSystemStatus() {
  const { failures } = usePollingInterval();
  return useQuery({
    queryKey: qk.systemStatus(),
    queryFn: ({ signal }) => trackPoll(pollController, () => getSystemStatus(signal), signal),
    staleTime: 0,
    retry: 0,
    refetchInterval: nextPollDelay(failures, SYSTEM_STATUS_POLL_MS),
    refetchIntervalInBackground: false,
  });
}
