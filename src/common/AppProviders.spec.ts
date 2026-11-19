import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { handleUnauthorized } from './AppProviders';
import { createPollController } from './polling';
import { qk } from './query-keys';

describe('handleUnauthorized', () => {
  it('clears the cache, resets polling and renders the URL again', () => {
    const client = new QueryClient();
    client.setQueryData(qk.settings(), { any: 1 });
    const controller = createPollController();
    controller.recordFailure('k');
    const refresh = vi.fn();
    handleUnauthorized(client, controller, refresh);
    expect(client.getQueryData(qk.settings())).toBeUndefined();
    expect(controller.getSnapshot().failures).toBe(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
