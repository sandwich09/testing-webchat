import type { ReactNode } from 'react';

import { cn } from '@/common/common.logic';

type SettingsRowProps = {
  /**
   * Bold label. Leave it out for a section's top row when the section heading already says the
   * same thing (knowledge base, canned replies, usage), so the title does not show twice.
   */
  label?: string;
  /** One line under the label. */
  description?: string;
  /** The control on the right. */
  children: ReactNode;
  /** A wide control (input, textarea, table) goes under the label on a narrow screen. */
  wideControl?: boolean;
  testId?: string;
  className?: string;
};

/** Label and description on the left, control on the right (ui-screens 9.2). */
export function SettingsRow({
  label,
  description,
  children,
  wideControl = false,
  testId,
  className,
}: SettingsRowProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex min-h-16 gap-x-6 gap-y-3 border-b border-line py-3.5 last:border-b-0',
        wideControl ? 'flex-col medium:flex-row medium:items-center' : 'items-center',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {label ? <p className="text-body font-bold">{label}</p> : null}
        {description ? <p className="text-sub text-muted">{description}</p> : null}
      </div>
      <div className={cn('shrink-0', wideControl && 'w-full medium:w-auto')}>{children}</div>
    </div>
  );
}
