'use client';

// Data hooks of the topic guard section (ui-screens 7.1 and 7.7).
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { qk, qkAll } from '@/common/query-keys';
import type { SettingsDto } from '@/contracts';

import { updateSettings, type SettingsPatch } from './settings.api';
import { testTopicGuard } from './settings.guard.api';
import { applySavedSettings } from './settings.hooks';

/**
 * PATCH /api/settings for the guard fields. The switch and the topic list show their new value at
 * once and come back if the server refuses; a topic being typed stays in the section's own state
 * until the save works, so it is never lost. The result replaces `qk.settings()`.
 */
export function useUpdateGuardSettings() {
  const client = useQueryClient();
  const key = qk.settings();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => updateSettings(patch),
    onMutate: async (patch) => {
      const { guardEnabled: enabled, guardTopics: topics } = patch;
      if (enabled === undefined && topics === undefined) return { previous: undefined };
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SettingsDto>(key);
      client.setQueryData<SettingsDto>(key, (old) =>
        old === undefined
          ? old
          : {
              ...old,
              guard: {
                ...old.guard,
                enabled: enabled ?? old.guard.enabled,
                topics: topics ?? old.guard.topics,
              },
            },
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
 * messages, the system status and this month's usage load again.
 */
export function useTestTopicGuard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => testTopicGuard(text),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.settings() }),
        client.invalidateQueries({ queryKey: qk.systemStatus() }),
        client.invalidateQueries({ queryKey: qkAll.usage }),
      ]).then(() => undefined),
  });
}
