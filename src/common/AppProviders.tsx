'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { setUnauthorizedHandler } from '@/common/common.api';
import { pollController, type PollController } from '@/common/polling';

/**
 * What a 401 from any API does (ui-screens 1.6): stop and forget every query, then render the
 * same URL again, which `proxy.ts` answers with the welcome page while the cookie is not valid.
 */
export function handleUnauthorized(
  client: QueryClient,
  controller: PollController,
  refresh: () => void,
): void {
  void client.cancelQueries();
  client.clear();
  controller.reset();
  refresh();
}

// The QueryClient and the toast host live in `Providers.tsx` (root layout). This component, mounted
// by `AppShell`, registers the unauthorized handler of `apiFetch` for the signed-in pages.
export function AppProviders({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();

  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        handleUnauthorized(client, pollController, () => {
          router.refresh();
        });
      }),
    [client, router],
  );

  return children;
}
