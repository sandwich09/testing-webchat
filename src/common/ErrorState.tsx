import { TriangleAlert } from 'lucide-react';

import { copy } from '@/common/common.constants';
import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';

type ErrorStateProps = {
  /** Thai message that says what happened. */
  message: string;
  /** Shows the retry button when given. */
  onRetry?: () => void;
  testId?: string;
  retryTestId?: string;
  /** Machine code of the error, exposed as `data-code` for tests. */
  code?: string;
  className?: string;
};

/** Error box with a retry button (ui-screens 3.5). */
export function ErrorState({
  message,
  onRetry,
  testId = testIds.sectionError,
  retryTestId = testIds.sectionErrorRetry,
  code,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      data-code={code}
      className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}
    >
      <TriangleAlert aria-hidden="true" className="size-6 text-warn" />
      <p className="text-body text-fg">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} data-testid={retryTestId}>
          {copy.action.retry}
        </Button>
      ) : null}
    </div>
  );
}
