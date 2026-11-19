import type { ReactNode } from 'react';

import { cn } from '@/common/common.logic';

/**
 * Width of the control column on a wide screen. Every row of a card that has a control on the
 * right uses it, so the controls share one width and one right edge (ui-screens 9.2).
 */
export const SETTINGS_CONTROL_COLUMN = 'w-full medium:w-[340px]';

/**
 * Where the control goes:
 * - `inline`: on the right on every screen width (a switch, a small button)
 * - `column`: in the control column on a wide screen, under the label at full width on a narrow one
 * - `stacked`: under the label at full width on every screen width (a textarea, a list, a table)
 */
export type SettingsRowLayout = 'inline' | 'column' | 'stacked';

type SettingsRowProps = {
  /**
   * Bold label. Leave it out for a card's top row when the card heading already says the same
   * thing (usage), so the title does not show twice.
   */
  label?: string;
  /** Id of the label, for a control that names itself with `aria-labelledby`. */
  labelId?: string;
  /** One line under the label. */
  description?: string;
  /** Id of the description, for a control that points to it with `aria-describedby`. */
  descriptionId?: string;
  /** The control. */
  children: ReactNode;
  layout?: SettingsRowLayout;
  testId?: string;
  className?: string;
};

/** Label and description on the left, control on the right or under them (ui-screens 9.2). */
export function SettingsRow({
  label,
  labelId,
  description,
  descriptionId,
  children,
  layout = 'inline',
  testId,
  className,
}: SettingsRowProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex min-h-16 gap-x-6 gap-y-3 py-3',
        layout === 'inline' && 'items-center',
        layout === 'column' && 'flex-col medium:flex-row medium:items-start',
        layout === 'stacked' && 'flex-col',
        className,
      )}
    >
      <div className={cn('min-w-0 flex-1', layout === 'column' && 'medium:pt-2')}>
        {label ? (
          <p id={labelId} className="text-body font-bold">
            {label}
          </p>
        ) : null}
        {description ? (
          <p id={descriptionId} className="text-sub text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          'min-w-0',
          layout === 'inline' && 'shrink-0',
          layout === 'column' && cn('shrink-0', SETTINGS_CONTROL_COLUMN),
          layout === 'stacked' && 'w-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}
