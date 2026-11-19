import type { ReactNode } from 'react';

import { cn } from '@/common/common.logic';

type EmptyStateProps = {
  /** Short line that says what is empty. */
  title: string;
  /** One sentence that says what to do next. */
  body?: string;
  /** Optional button or link that does it. */
  action?: ReactNode;
  testId?: string;
  className?: string;
};

/** Empty box with a hint (frontend.md: every screen has loading, empty, error and normal states). */
export function EmptyState({ title, body, action, testId, className }: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}
    >
      <p className="text-name font-bold text-fg">{title}</p>
      {body ? <p className="max-w-[32ch] text-sub text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
