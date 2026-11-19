'use client';

import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { copy } from '@/common/common.constants';
import { Button } from '@/common/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/common/ui/dialog';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Defaults to `common.action.cancel`. */
  cancelLabel?: string;
  /** `danger` makes the confirm button red, for an action that cannot be undone. */
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  /** While true both buttons are disabled and the confirm button shows a spinner of the same width. */
  pending?: boolean;
  /** Error message shown inside the dialog; the dialog stays open. */
  errorMessage?: ReactNode;
  testId?: string;
  cancelTestId?: string;
  confirmTestId?: string;
};

/**
 * Two-button confirmation dialog (ui-screens 9.7). Focus starts on the cancel button, the safe
 * action, and Escape equals cancel.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = copy.action.cancel,
  tone = 'primary',
  onConfirm,
  pending = false,
  errorMessage,
  testId,
  cancelTestId,
  confirmTestId,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testId}
        showCloseButton={false}
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const cancel = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            '[data-confirm-cancel]',
          );
          cancel?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {errorMessage ? (
          <p role="alert" className="text-sub text-danger">
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              onOpenChange(false);
            }}
            data-confirm-cancel=""
            data-testid={cancelTestId}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={onConfirm}
            data-testid={confirmTestId}
            className="relative"
          >
            <span className={pending ? 'invisible' : undefined}>{confirmLabel}</span>
            {pending ? (
              <Loader2 aria-hidden="true" className="absolute size-[18px] animate-spin" />
            ) : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
