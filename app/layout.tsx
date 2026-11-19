import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { copy } from '@/common/common.constants';
import { lineSeedSansTh } from '@/common/fonts/fonts';
import { Providers } from '@/common/Providers';

import './globals.css';

// Every page is rendered per request so the proxy's CSP nonce reaches its scripts.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: copy.appName,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th" className={lineSeedSansTh.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
