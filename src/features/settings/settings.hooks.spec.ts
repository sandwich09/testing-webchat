import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { qk } from '@/common/query-keys';
import type { SettingsDto } from '@/contracts';

import { applySavedSettings } from './settings.hooks';

describe('applySavedSettings', () => {
  it('writes the answer to the settings cache and reloads the status', () => {
    const client = new QueryClient();
    client.setQueryData(qk.settings(), { old: true });
    client.setQueryData(qk.systemStatus(), { any: 1 });
    const saved = { new: true } as unknown as SettingsDto; // only the stored value matters here

    applySavedSettings(client, saved);

    const state = (key: readonly unknown[]) =>
      client.getQueryCache().find({ queryKey: key })?.state;
    expect(client.getQueryData(qk.settings())).toEqual(saved);
    expect(state(qk.settings())?.isInvalidated).toBe(false);
    expect(state(qk.systemStatus())?.isInvalidated).toBe(true);
  });
});
