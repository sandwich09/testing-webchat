'use client';

// Data hooks of the topic guard section and the Guardrails panel (ui-screens 7.1 and 7.7).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { nextPollDelay } from '@/common/common.logic';
import { pollController, trackPoll, usePollingInterval } from '@/common/polling';
import { qk, qkAll } from '@/common/query-keys';
import type { SettingsDto } from '@/contracts';

import { getGuardrailStats, testTopicGuard } from './guard.api';
import { updateSettings, type SettingsPatch } from './settings.api';
import { SYSTEM_STATUS_POLL_MS } from './settings.constants';
import { applySavedSettings } from './settings.hooks';

/** GET /api/system/guardrails, polled every `SYSTEM_STATUS_POLL_MS` while the page is open. */
export function useGuardrailStats() {
  const { failures } = usePollingInterval();
  return useQuery({
    queryKey: qk.guardrails(),
    queryFn: ({ signal }) => trackPoll(pollController, () => getGuardrailStats(signal), signal),
    staleTime: 0,
    retry: 0,
    refetchInterval: nextPollDelay(failures, SYSTEM_STATUS_POLL_MS),
    refetchIntervalInBackground: false,
  });
}

/**
 * PATCH /api/settings for the guard fields. The switch shows its new value at once and comes back
 * if the server refuses; the topics and the refusal text stay in the section's own state until the
 * save works, so what was typed is never lost. The result replaces `qk.settings()`.
 */
export function useUpdateGuardSettings() {
  const client = useQueryClient();
  const key = qk.settings();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => updateSettings(patch),
    onMutate: async (patch) => {
      if (patch.guardEnabled === undefined) return { previous: undefined };
      const enabled = patch.guardEnabled;
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SettingsDto>(key);
      client.setQueryData<SettingsDto>(key, (old) =>
        old === undefined ? old : { ...old, guard: { ...old.guard, enabled } },
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
 * POST /api/settings/guard/test. A test costs a call to the model, so the counter of blocked
 * messages, the Guardrails numbers, the system status and this month's usage load again.
 */
export function useTestTopicGuard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => testTopicGuard(text),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.settings() }),
        client.invalidateQueries({ queryKey: qk.guardrails() }),
        client.invalidateQueries({ queryKey: qk.systemStatus() }),
        client.invalidateQueries({ queryKey: qkAll.usage }),
      ]).then(() => undefined),
  });
}
