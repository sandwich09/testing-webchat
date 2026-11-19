'use client';

import type { ReactNode } from 'react';

import { SectionErrorBoundary } from '@/common/SectionErrorBoundary';

type SettingsSectionProps = {
  /** Heading text. */
  title: string;
  /** `data-testid` of the section, from `testIds.settingsSection*`. */
  testId: string;
  /** Runs after the section's error boundary resets, so the section can refetch. */
  onRetry?: () => void;
  children: ReactNode;
};

/** Section heading, divider and its own error boundary, so one broken section does not break the page (ui-screens 9.2). */
export function SettingsSection({ title, testId, onRetry, children }: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className="mt-8 border-t border-line pt-6"
    >
      <h2 id={`${testId}-title`} className="mb-2 text-section font-bold">
        {title}
      </h2>
      <SectionErrorBoundary onRetry={onRetry}>{children}</SectionErrorBoundary>
    </section>
  );
}
