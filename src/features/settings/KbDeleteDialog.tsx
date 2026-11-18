'use client';

import { useState } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { ConfirmDialog } from '@/common/ConfirmDialog';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import type { DocumentDto } from '@/contracts';
import { copy } from '@/features/settings/settings.constants';
import { useDeleteKbDocument } from '@/features/settings/settings.hooks';

type KbDeleteDialogProps = {
  document: DocumentDto | null;
  onClose: () => void;
  /** Runs after the file was deleted and the dialog was asked to close (the section moves focus to the upload button). */
  onDeleted?: () => void;
};

/** Confirmation before a file leaves the knowledge base (ui-screens 9.7). Focus starts on cancel. */
export function KbDeleteDialog({ document: doc, onClose, onDeleted }: KbDeleteDialogProps) {
  const deleteDocument = useDeleteKbDocument();
  // Keep the last file while the dialog fades out, so the title does not go blank.
  const [last, setLast] = useState(doc);
  if (doc !== null && doc !== last) setLast(doc);
  const shown = doc ?? last;

  const close = (): void => {
    deleteDocument.reset();
    onClose();
  };

  const error = deleteDocument.error;
  const errorText =
    error === null
      ? undefined
      : (errorMessage(errorCodeOf(error), { variant: 'knowledge' }) ??
        errorMessage('internal.unexpected'));

  return (
    <ConfirmDialog
      open={doc !== null}
      onOpenChange={(open) => {
        if (!open && !deleteDocument.isPending) close();
      }}
      title={copy.kb.deleteTitle.replace('{fileName}', shown?.fileName ?? '')}
      description={copy.kb.deleteBody}
      confirmLabel={copy.kb.deleteConfirm}
      cancelLabel={copy.kb.deleteCancel}
      tone="danger"
      pending={deleteDocument.isPending}
      errorMessage={errorText}
      onConfirm={() => {
        if (doc === null) return;
        deleteDocument.mutate(doc.id, {
          onSuccess: () => {
            showToast('success', copy.kb.deletedToast);
            close();
            onDeleted?.();
          },
        });
      }}
      testId={testIds.kbDeleteDialog}
      cancelTestId={testIds.kbDeleteCancel}
      confirmTestId={testIds.kbDeleteConfirm}
    />
  );
}
