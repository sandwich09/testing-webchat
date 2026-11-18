'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { shouldRetryQuery } from '@/common/common.api';
import { Toaster } from '@/common/ui/sonner';

// Query defaults (ui-screens 7.1): queries that are not polled retry once, never after a 4xx;
// polled queries set `retry: 0` themselves (the next round is the retry). Focus refetch is off:
// the polling lifecycle reloads lists when the tab is shown, and `useSettings` opts in itself.
// One QueryClient per browser session.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 0, retry: shouldRetryQuery },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
