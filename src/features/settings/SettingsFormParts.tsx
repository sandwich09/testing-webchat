'use client';

// Pieces shared by the rows of the settings sections (ui-screens 9.2): the save button of a
// field, the error line under it, the text of a failed save and the arrow keys of a radio group.
import { Loader2 } from 'lucide-react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
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

export function SaveButton({ pending, testId }: { pending: boolean; testId: string }) {
  return (
    <Button
      type="submit"
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      data-testid={testId}
      className="relative min-w-20"
      onClick={(event) => {
        // aria-disabled keeps focus on the button while saving; a second click does nothing.
        if (pending) event.preventDefault();
      }}
    >
      <span className={pending ? 'invisible' : undefined}>{commonCopy.action.save}</span>
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
