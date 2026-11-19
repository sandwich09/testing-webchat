'use client';

import type { ReactNode } from 'react';

import { SectionErrorBoundary } from '@/common/SectionErrorBoundary';

type SettingsSectionProps = {
  /** Heading text of the card. */
  title: string;
  /** `data-testid` of the card, from `testIds.settingsSection*`. */
  testId: string;
  /** Runs after the card's error boundary resets, so the card can refetch. */
  onRetry?: () => void;
  children: ReactNode;
};

/** A card of a settings tab: heading and its own error boundary, so one broken card does not break the tab (ui-screens 9.2). */
export function SettingsSection({ title, testId, onRetry, children }: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className="rounded-[18px] border border-line bg-surface px-4 py-4 medium:px-6 medium:py-5"
    >
      <h2 id={`${testId}-title`} className="mb-1 text-section font-bold">
        {title}
      </h2>
      <SectionErrorBoundary onRetry={onRetry}>{children}</SectionErrorBoundary>
    </section>
  );
}
