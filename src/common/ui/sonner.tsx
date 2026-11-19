'use client';

import * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// The CLI output reads the theme from next-themes; the app has a single light theme
// (docs/adr/0014-ui-stack-and-theme.md), so the theme is fixed and next-themes is not installed.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties // CSS custom properties are not part of CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
