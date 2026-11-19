'use client';

// Pieces shared by the rows of the settings sections (ui-screens 9.2): the save button of a
// field, the error line under it, the text of a failed save and the arrow keys of a radio group.
import { Loader2 } from 'lucide-react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn } from '@/common/common.logic';
import { errorMessage } from '@/common/error-messages';
import { Button } from '@/common/ui/button';

/** Thai text of a failed save: the catalog text of the code, else the generic form text. */
export function saveFailureText(error: unknown): string {
  return (
    errorMessage(errorCodeOf(error), { variant: 'form' }) ??
    errorMessage('internal.unexpected', { variant: 'form' }) ??
    commonCopy.error.network
  );
}

/** Option of a radio group that an arrow key moves to, wrapping at both ends. `null` for other keys. */
export function nextRadioIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * The save button of a field. It is always next to its field, so the field does not move when the
 * admin starts typing: a disabled secondary button while nothing changed, the primary button once
 * the value differs from the saved one (ux-writing "ปุ่ม"). While saving it keeps its width, shows
 * a spinner and keeps focus (aria-disabled).
 */
export function SaveButton({
  pending,
  dirty,
  testId,
  label = commonCopy.action.save,
  className,
}: {
  pending: boolean;
  /** The field holds a value that is not saved yet. */
  dirty: boolean;
  testId: string;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      variant={dirty || pending ? 'default' : 'secondary'}
      disabled={!dirty && !pending}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      data-testid={testId}
      data-dirty={dirty}
      className={cn('relative min-w-20 medium:h-10', className)}
      onClick={(event) => {
        // aria-disabled keeps focus on the button while saving; a second click does nothing.
        if (pending) event.preventDefault();
      }}
    >
      <span className={pending ? 'invisible' : undefined}>{label}</span>
      {pending ? (
        <Loader2 aria-hidden="true" className="absolute size-[18px] animate-spin" />
      ) : null}
    </Button>
  );
}

export function FieldError({ id, message }: { id: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p id={id} role="alert" className="text-sub text-danger">
      {message}
    </p>
  );
}
