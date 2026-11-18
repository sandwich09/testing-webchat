import type { ReactNode } from 'react';

import { AppShell } from '@/common/AppShell';

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
