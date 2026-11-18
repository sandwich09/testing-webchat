'use client';

import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { getSettings, listCannedReplies } from '@/common/common.api';
import { qk } from '@/common/query-keys';

/** `settings` stays fresh this long (ui-screens 7.1). */
export const SETTINGS_STALE_MS = 30_000;
/** `canned-replies` stays fresh this long (ui-screens 7.1). */
export const CANNED_REPLIES_STALE_MS = 60_000;

/**
 * GET /api/settings, shared by the shell, the chat page and the settings page. Not polled; it is
 * fetched again when the tab comes back and is older than 30 seconds. `client.pollIntervalMs` is
 * the polling interval of the whole app (see `usePollingInterval`).
 */
export function useSettings() {
  return useQuery({
    queryKey: qk.settings(),
    queryFn: ({ signal }) => getSettings(signal),
    staleTime: SETTINGS_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

/** GET /api/canned-replies, shared by the composer picker and the settings section. */
export function useCannedReplies() {
  return useQuery({
    queryKey: qk.cannedReplies(),
    queryFn: ({ signal }) => listCannedReplies(signal),
    staleTime: CANNED_REPLIES_STALE_MS,
  });
}

const subscribeNothing = (): (() => void) => () => {};

/**
 * False in the server render and during hydration, true afterwards. Text that depends on the
 * browser (such as its clock) renders only once this is true, so the first paint matches the
 * server HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
