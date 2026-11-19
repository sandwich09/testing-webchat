'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { useCannedReplies } from '@/common/common.hooks';
import { ConfirmDialog } from '@/common/ConfirmDialog';
import { EmptyState } from '@/common/EmptyState';
import { ErrorState } from '@/common/ErrorState';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
import { Skeleton } from '@/common/ui/skeleton';
import { CANNED_REPLY_MAX_COUNT, type CannedReplyDto } from '@/contracts';
import { CannedReplyForm } from '@/features/settings/CannedReplyForm';
import { copy } from '@/features/settings/settings.constants';
import { useDeleteCannedReply } from '@/features/settings/settings.hooks';
import { SettingsRow } from '@/features/settings/SettingsRow';
import { SettingsSection } from '@/features/settings/SettingsSection';

/** Focus waits for the delete dialog to finish fading out (200 ms) so it is not taken back. */
const FOCUS_AFTER_DIALOG_MS = 350;
const SKELETON_ROWS = 3;

/** The add form, or the edit form of one reply. */
type Editing = null | { kind: 'new' } | { kind: 'edit'; id: string };

function ReplyRow({
  reply,
  onEdit,
  onDelete,
}: {
  reply: CannedReplyDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const titleId = useId();
  return (
    <li
      data-testid={testIds.cannedRow}
      data-id={reply.id}
      className="flex items-center gap-4 border-b border-line py-3.5"
    >
      <div className="min-w-0 flex-1">
        <p id={titleId} className="text-body font-bold break-words">
          {reply.title}
        </p>
        <p className="line-clamp-2 text-sub break-words text-muted">{reply.text}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon"
          aria-label={copy.canned.edit}
          aria-describedby={titleId}
          onClick={onEdit}
          data-testid={testIds.cannedRowEdit}
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          size="icon"
          aria-label={copy.canned.delete}
          aria-describedby={titleId}
          onClick={onDelete}
          data-testid={testIds.cannedRowDelete}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/** Canned replies: list, add, edit and delete (ui-screens 9.8). One form is open at a time. */
export function CannedRepliesSection() {
  const list = useCannedReplies();
  const deleteReply = useDeleteCannedReply();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CannedReplyDto | null>(null);
  // Kept while the delete dialog fades out so its title does not go blank.
  const [lastDeleting, setLastDeleting] = useState(deleting);
  if (deleting !== null && deleting !== lastDeleting) setLastDeleting(deleting);
  const shownDeleting = deleting ?? lastDeleting;

  const addRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const limitId = useId();

  const replies = list.data === undefined ? undefined : [...list.data].sort(bySortOrder);
  const atLimit = (replies?.length ?? 0) >= CANNED_REPLY_MAX_COUNT;
  const limitText = errorMessage('canned_reply.limit_reached', { max: CANNED_REPLY_MAX_COUNT });

  /** Closes the form and puts focus back where it came from: the row's edit button, or the add button. */
  const closeForm = (): void => {
    const id = editing?.kind === 'edit' ? editing.id : null;
    setEditing(null);
    window.setTimeout(() => {
      const edit =
        id !== null
          ? listRef.current?.querySelector<HTMLElement>(
              `[data-id="${CSS.escape(id)}"] [data-testid="${testIds.cannedRowEdit}"]`,
            )
          : null;
      (edit ?? addRef.current)?.focus();
    }, 0);
  };

  const deleteError = deleteReply.error;
  const deleteErrorText =
    deleteError === null
      ? undefined
      : (errorMessage(errorCodeOf(deleteError)) ?? errorMessage('internal.unexpected'));

  const closeDelete = (): void => {
    deleteReply.reset();
    setDeleting(null);
  };

  let body: ReactNode;
  if (replies === undefined && list.isError) {
    body = (
      <ErrorState
        message={copy.canned.error}
        onRetry={() => {
          void list.refetch();
        }}
      />
    );
  } else if (replies === undefined) {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-3 py-2">
        <span className="sr-only">{commonCopy.loading}</span>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (replies.length === 0 && editing?.kind !== 'new') {
    body = <EmptyState title={copy.canned.empty} testId={testIds.cannedEmpty} />;
  } else {
    body = (
      <ul ref={listRef}>
        {editing?.kind === 'new' ? (
          <li>
            <CannedReplyForm onClose={closeForm} />
          </li>
        ) : null}
        {replies.map((reply) =>
          editing?.kind === 'edit' && editing.id === reply.id ? (
            <li key={reply.id}>
              <CannedReplyForm reply={reply} onClose={closeForm} />
            </li>
          ) : (
            <ReplyRow
              key={reply.id}
              reply={reply}
              onEdit={() => {
                setEditing({ kind: 'edit', id: reply.id });
              }}
              onDelete={() => {
                setDeleting(reply);
              }}
            />
          ),
        )}
      </ul>
    );
  }

  return (
    <SettingsSection
      title={copy.canned.title}
      testId={testIds.settingsSectionCanned}
      onRetry={() => {
        void list.refetch();
      }}
    >
      <SettingsRow description={copy.canned.description}>
        <Button
          ref={addRef}
          disabled={atLimit}
          aria-describedby={atLimit ? limitId : undefined}
          onClick={() => {
            setEditing({ kind: 'new' });
          }}
          data-testid={testIds.cannedAdd}
        >
          <Plus aria-hidden="true" />
          {copy.canned.add}
        </Button>
      </SettingsRow>
      {atLimit ? (
        <p id={limitId} className="pb-3 text-sub text-muted">
          {limitText}
        </p>
      ) : null}
      {body}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteReply.isPending) closeDelete();
        }}
        title={copy.canned.deleteTitle.replace('{title}', shownDeleting?.title ?? '')}
        description={copy.canned.deleteBody}
        confirmLabel={copy.canned.deleteConfirm}
        cancelLabel={copy.canned.deleteCancel}
        tone="danger"
        pending={deleteReply.isPending}
        errorMessage={deleteErrorText}
        onConfirm={() => {
          if (deleting === null) return;
          deleteReply.mutate(deleting.id, {
            onSuccess: () => {
              showToast('success', copy.canned.deletedToast);
              closeDelete();
              window.setTimeout(() => {
                addRef.current?.focus();
              }, FOCUS_AFTER_DIALOG_MS);
            },
          });
        }}
        testId={testIds.cannedDeleteDialog}
        confirmTestId={testIds.cannedDeleteConfirm}
      />
    </SettingsSection>
  );
}

function bySortOrder(a: CannedReplyDto, b: CannedReplyDto): number {
  return a.sortOrder - b.sortOrder;
}
