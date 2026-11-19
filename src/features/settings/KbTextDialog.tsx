'use client';

import { useEffect, useRef, useState } from 'react';

import { copy as commonCopy } from '@/common/common.constants';
import { formatInt } from '@/common/common.logic';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/common/ui/dialog';
import { Skeleton } from '@/common/ui/skeleton';
import { useKbDocument, useKbDocuments } from '@/features/settings/settings.hooks';
import { copy } from '@/features/settings/settings.constants';

type KbTextDialogProps = {
  documentId: string | null;
  onClose: () => void;
};

const SKELETON_BARS = 8;

/**
 * Read-only view of the text the AI uses from one file (ui-screens 9.6). The text is plain text:
 * it is a PDF's content, so it is never treated as markup.
 */
export function KbTextDialog({ documentId, onClose }: KbTextDialogProps) {
  // Keep the last id while the dialog fades out, so the title does not go blank.
  const [lastId, setLastId] = useState(documentId);
  if (documentId !== null && documentId !== lastId) setLastId(documentId);
  const activeId = documentId ?? lastId;

  const detail = useKbDocument(activeId);
  const list = useKbDocuments();
  const contentRef = useRef<HTMLPreElement>(null);

  const fileName =
    detail.data?.fileName ??
    list.data?.documents.find((doc) => doc.id === activeId)?.fileName ??
    '';

  // The text appears after the dialog opens when it is not cached yet: move to it then, so the
  // arrow keys scroll it at once.
  const loaded = detail.data !== undefined;
  useEffect(() => {
    if (loaded && documentId !== null) contentRef.current?.focus();
  }, [loaded, documentId]);

  return (
    <Dialog
      open={documentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid={testIds.kbTextDialog}
        showCloseButton={false}
        className="max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto] rounded-[18px] sm:max-w-[720px]"
        onOpenAutoFocus={(event) => {
          // Focus goes to the text once it is there (effect above); until then to the dialog box.
          event.preventDefault();
          if (contentRef.current) contentRef.current.focus();
          else (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="break-words">{fileName}</DialogTitle>
          {detail.data ? (
            <DialogDescription>
              {copy.kb.textDialogSubtitle
                .replace('{pages}', formatInt(detail.data.pageCount ?? 0))
                .replace('{tokens}', formatInt(detail.data.tokenCount ?? 0))}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{copy.kb.textDialogError}</DialogDescription>
          )}
        </DialogHeader>

        {detail.isError ? (
          <ErrorState
            message={copy.kb.textDialogError}
            onRetry={() => {
              void detail.refetch();
            }}
          />
        ) : detail.data ? (
          <pre
            ref={contentRef}
            tabIndex={0}
            data-testid={testIds.kbTextContent}
            className="min-h-0 overflow-auto rounded-[13px] border border-line bg-rail p-3 font-[inherit] text-body leading-[1.6] break-words whitespace-pre-wrap outline-none focus-visible:ring-[3px] focus-visible:ring-accent-strong/30"
          >
            {detail.data.extractedText ?? ''}
          </pre>
        ) : (
          <div role="status" aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">{commonCopy.loading}</span>
            {Array.from({ length: SKELETON_BARS }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="default" onClick={onClose} data-testid={testIds.kbTextClose}>
            {commonCopy.action.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
