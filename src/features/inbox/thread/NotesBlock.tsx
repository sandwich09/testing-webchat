'use client';

import { Lock, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type SyntheticEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn, formatDateTime } from '@/common/common.logic';
import { ConfirmDialog } from '@/common/ConfirmDialog';
import { errorMessage } from '@/common/error-messages';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
import { Skeleton } from '@/common/ui/skeleton';
import { Textarea } from '@/common/ui/textarea';
import { copy } from '@/features/inbox/inbox.constants';
import {
  useAddContactNote,
  useContactNotes,
  useDeleteContactNote,
} from '@/features/inbox/thread/inbox.notes.hooks';
import {
  checkNote,
  isAddKey,
  noteCounterText,
  noteTooLongText,
  type NoteItem,
} from '@/features/inbox/thread/inbox.notes.logic';
import { fillCopy } from '@/features/inbox/thread/inbox.thread.logic';

/** Thai text of a failed note request: the catalog text of its code, else `fallback`. */
const failureText = (error: unknown, fallback: string): string =>
  errorMessage(errorCodeOf(error), { variant: 'form' }) ?? fallback;

function NoteRow({
  note,
  now,
  onDelete,
}: {
  note: NoteItem;
  now: Date;
  onDelete: (note: NoteItem) => void;
}) {
  const when = formatDateTime(note.createdAt, now);
  return (
    <li
      data-testid={testIds.infoNote}
      data-note-id={note.id}
      data-pending={note.pending ? 'true' : undefined}
      className={cn('flex items-start gap-2 py-2', note.pending && 'opacity-60')}
    >
      <div className="min-w-0 flex-1">
        <p className="text-body [overflow-wrap:anywhere] whitespace-pre-wrap">{note.text}</p>
        <p className="text-meta text-muted">
          {note.pending ? copy.notes.saving : <time dateTime={note.createdAt}>{when}</time>}
        </p>
      </div>
      {note.pending ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid={testIds.infoNoteDelete}
          aria-label={fillCopy(copy.notes.delete, { date: when })}
          onClick={() => {
            onDelete(note);
          }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

/**
 * Admin-only notes about the customer in the info panel (ui-screens 6, webchat-inbox "โน้ตของ
 * แอดมิน"). Never sent to LINE or the AI. Enter adds, Shift+Enter starts a new line; the note
 * shows at once and goes away again with the typed text restored when saving fails.
 */
export function NotesBlock({ contactId, now }: { contactId: string; now: Date }) {
  const notes = useContactNotes(contactId);
  const add = useAddContactNote(contactId);
  const remove = useDeleteContactNote(contactId);
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<NoteItem | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const counterId = useId();
  const errorId = useId();

  const checked = checkNote(draft);
  const tooLong = !checked.ok && checked.code === 'too_long';
  const errorText = tooLong ? noteTooLongText() : addError;

  const submit = (event?: SyntheticEvent) => {
    event?.preventDefault();
    if (!checked.ok) {
      areaRef.current?.focus();
      return;
    }
    const text = checked.text;
    setDraft('');
    setAddError(null);
    add.mutate(
      { text, tempId: `pending-${crypto.randomUUID()}`, at: new Date().toISOString() },
      {
        onError: (error) => {
          // The typed text comes back, unless the admin has started another note meanwhile.
          setDraft((current) => (current === '' ? text : current));
          setAddError(failureText(error, copy.notes.addFailed));
          areaRef.current?.focus();
        },
      },
    );
  };

  return (
    <section
      data-testid={testIds.infoNotes}
      aria-labelledby={titleId}
      className="border-t border-line px-4 py-3"
    >
      <h3 id={titleId} className="flex items-center gap-1.5 text-body font-bold">
        <Lock aria-hidden="true" className="size-4 text-muted" />
        {copy.notes.title}
      </h3>
      <p className="text-sub text-muted">{copy.notes.hint}</p>

      <form noValidate onSubmit={submit} className="mt-2 flex flex-col gap-1.5">
        <Textarea
          ref={areaRef}
          rows={2}
          aria-label={copy.notes.inputLabel}
          aria-invalid={errorText !== null || undefined}
          aria-describedby={errorText !== null ? `${errorId} ${counterId}` : counterId}
          placeholder={copy.notes.placeholder}
          data-testid={testIds.infoNoteInput}
          className="max-h-48 min-h-[4.5rem] resize-y"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setAddError(null);
          }}
          onKeyDown={(event) => {
            if (isAddKey({ ...event, isComposing: event.nativeEvent.isComposing })) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {errorText !== null ? (
              <p
                id={errorId}
                role="alert"
                data-testid={testIds.infoNoteError}
                className="text-sub text-danger"
              >
                {errorText}
              </p>
            ) : (
              <p className="text-meta text-muted">{copy.notes.keys}</p>
            )}
          </div>
          <p
            id={counterId}
            data-testid={testIds.infoNoteCounter}
            className={cn('shrink-0 text-meta', tooLong ? 'text-danger' : 'text-muted')}
          >
            {noteCounterText(draft)}
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" data-testid={testIds.infoNoteAdd}>
            {copy.notes.add}
          </Button>
        </div>
      </form>

      {notes.data !== undefined ? (
        notes.data.length === 0 ? (
          <p data-testid={testIds.infoNotesEmpty} className="py-3 text-sub text-muted">
            {copy.notes.empty}
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {notes.data.map((note) => (
              <NoteRow key={note.id} note={note} now={now} onDelete={setConfirming} />
            ))}
          </ul>
        )
      ) : notes.isError ? (
        <ErrorState
          message={copy.notes.error}
          testId={testIds.infoNotesError}
          onRetry={() => {
            void notes.refetch();
          }}
        />
      ) : (
        <div data-testid={testIds.infoNotesSkeleton} aria-busy="true" className="space-y-2 py-2">
          <span className="sr-only" role="status">
            {commonCopy.loading}
          </span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (open || remove.isPending) return;
          setConfirming(null);
          // The failure of an earlier attempt belongs to that attempt, not to the next opening.
          remove.reset();
        }}
        title={copy.notes.deleteTitle}
        description={copy.notes.deleteDescription}
        confirmLabel={copy.notes.deleteConfirm}
        tone="danger"
        pending={remove.isPending}
        errorMessage={
          remove.isError ? failureText(remove.error, commonCopy.error.network) : undefined
        }
        testId={testIds.infoNoteDeleteDialog}
        confirmTestId={testIds.infoNoteDeleteConfirm}
        onConfirm={() => {
          if (confirming === null) return;
          remove.mutate(confirming.id, {
            onSuccess: () => {
              setConfirming(null);
              remove.reset();
              showToast('success', copy.notes.deleted);
            },
          });
        }}
      />
      {add.isPending ? (
        <span className="sr-only" role="status">
          {copy.notes.saving}
        </span>
      ) : null}
    </section>
  );
}
