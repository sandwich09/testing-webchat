'use client';

import { Loader2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn, formatInt } from '@/common/common.logic';
import { EmptyState } from '@/common/EmptyState';
import { ErrorState } from '@/common/ErrorState';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';
import { Skeleton } from '@/common/ui/skeleton';
import { PDF_MAX_BYTES, type DocumentDto } from '@/contracts';
import { KbDeleteDialog } from '@/features/settings/KbDeleteDialog';
import { KbDocumentTable } from '@/features/settings/KbDocumentTable';
import { KbTextDialog } from '@/features/settings/KbTextDialog';
import { copy } from '@/features/settings/settings.constants';
import {
  useKbDocuments,
  useRetryKbDocument,
  useUploadKbDocument,
} from '@/features/settings/settings.hooks';
import { kbUsage, validatePdfFile } from '@/features/settings/settings.logic';
import { SettingsRow } from '@/features/settings/SettingsRow';
import { SettingsSection } from '@/features/settings/SettingsSection';

const BYTES_PER_MB = 1024 * 1024;
/** `%PDF-` is 5 bytes; a few more are read in case the file has a short header. */
const HEAD_BYTES = 8;
/**
 * The delete dialog gives focus back to the button that opened it when it has finished fading
 * out (200 ms); focus is moved to the upload button after that, so it is not taken back.
 */
const FOCUS_AFTER_DIALOG_MS = 350;
const SKELETON_ROWS = 3;

type UploadError = { code: string; message: string };

const TONE_CLASS = {
  normal: 'bg-accent',
  warn: 'bg-warn',
  full: 'bg-danger',
} as const;

function UsageMeter({ used, capacity }: { used: number; capacity: number }) {
  const usage = kbUsage({ usedTokens: used, capacityTokens: capacity });
  const text = copy.kb.usage
    .replace('{used}', formatInt(usage.used))
    .replace('{limit}', formatInt(usage.limit));
  return (
    <div className="flex flex-col gap-1.5 pb-3">
      <div
        role="meter"
        aria-label={copy.kb.usageLabel}
        aria-valuemin={0}
        aria-valuemax={Math.max(usage.limit, 1)}
        aria-valuenow={Math.min(usage.used, Math.max(usage.limit, 1))}
        aria-valuetext={text}
        data-testid={testIds.kbUsageMeter}
        data-tone={usage.tone}
        className="h-1 overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn('h-full rounded-full', TONE_CLASS[usage.tone])}
          style={{ width: `${String(Math.min(usage.ratio, 1) * 100)}%` }}
        />
      </div>
      <p data-testid={testIds.kbUsageText} className="text-sub tabular-nums">
        {text}
      </p>
    </div>
  );
}

/** Reads the first bytes of the file; an unreadable file counts as one that is not a PDF. */
async function readHead(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  } catch {
    return new Uint8Array();
  }
}

/** Knowledge base section: upload, usage meter, file table and its dialogs (ui-screens 9.5 to 9.7). */
export function KnowledgeSection() {
  const list = useKbDocuments();
  const upload = useUploadKbDocument();
  const retry = useRetryKbDocument();

  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DocumentDto | null>(null);

  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const retryInputRef = useRef<HTMLInputElement>(null);
  const retryIdRef = useRef<string | null>(null);

  const busy = upload.isPending || retry.isPending;

  const showServerError = (error: unknown, file: File): void => {
    const code = errorCodeOf(error);
    const message =
      errorMessage(code, {
        size: (file.size / BYTES_PER_MB).toFixed(1),
        maxMb: PDF_MAX_BYTES / BYTES_PER_MB,
      }) ?? errorMessage('internal.unexpected');
    setUploadError({ code, message: message ?? '' });
  };

  /** Checks the file in the browser first; only a file that passes is sent. */
  const sendFile = async (file: File, send: () => void): Promise<void> => {
    setUploadError(null);
    const check = validatePdfFile(file, await readHead(file));
    if (!check.ok) {
      setUploadError({
        code: check.code,
        message: copy.kb.errors[check.code]
          .replace('{maxMb}', String(PDF_MAX_BYTES / BYTES_PER_MB))
          .replace('{sizeMb}', check.sizeMb ?? ''),
      });
      return;
    }
    send();
  };

  const onUploadPicked = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // Clear the input so choosing the same file again still fires `change`.
    event.target.value = '';
    if (!file) return;
    void sendFile(file, () => {
      upload.mutate(file, {
        onError: (error) => {
          showServerError(error, file);
        },
      });
    });
  };

  const onRetryPicked = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const id = retryIdRef.current;
    if (!file || id === null) return;
    void sendFile(file, () => {
      retry.mutate(
        { id, file },
        {
          onError: (error) => {
            showServerError(error, file);
          },
        },
      );
    });
  };

  const data = list.data;
  let body: ReactNode;
  if (data === undefined && list.isError) {
    body = (
      <ErrorState
        message={copy.kb.error}
        testId={testIds.kbError}
        onRetry={() => {
          void list.refetch();
        }}
      />
    );
  } else if (data === undefined) {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-3 py-2">
        <span className="sr-only">{commonCopy.loading}</span>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  } else {
    body = (
      <>
        <UsageMeter used={data.usedTokens} capacity={data.capacityTokens} />
        {data.documents.length === 0 ? (
          <EmptyState title={copy.kb.empty} testId={testIds.kbEmpty} />
        ) : (
          <KbDocumentTable
            documents={data.documents}
            usedTokens={data.usedTokens}
            capacityTokens={data.capacityTokens}
            busy={busy}
            onView={setViewId}
            onDelete={setDeleting}
            onRetry={(id) => {
              retryIdRef.current = id;
              retryInputRef.current?.click();
            }}
          />
        )}
      </>
    );
  }

  return (
    <SettingsSection
      title={copy.kb.title}
      testId={testIds.settingsSectionKb}
      onRetry={() => {
        void list.refetch();
      }}
    >
      <SettingsRow description={copy.kb.description}>
        <Button
          ref={uploadButtonRef}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => {
            uploadInputRef.current?.click();
          }}
          data-testid={testIds.kbUpload}
          className="relative"
        >
          <span className={cn('inline-flex items-center gap-2', busy && 'invisible')}>
            <Upload aria-hidden="true" />
            {copy.kb.upload}
          </span>
          {busy ? (
            <Loader2 aria-hidden="true" className="absolute size-[18px] animate-spin" />
          ) : null}
        </Button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="application/pdf"
          hidden
          tabIndex={-1}
          onChange={onUploadPicked}
          data-testid={testIds.kbUploadInput}
        />
        <input
          ref={retryInputRef}
          type="file"
          accept="application/pdf"
          hidden
          tabIndex={-1}
          onChange={onRetryPicked}
        />
      </SettingsRow>
      <span role="status" className="sr-only">
        {busy ? copy.kb.uploading : ''}
      </span>
      {uploadError ? (
        <p
          role="alert"
          data-testid={testIds.kbUploadError}
          data-code={uploadError.code}
          className="pb-3 text-sub text-danger"
        >
          {uploadError.message}
        </p>
      ) : null}
      {body}
      <KbTextDialog
        documentId={viewId}
        onClose={() => {
          setViewId(null);
        }}
      />
      <KbDeleteDialog
        document={deleting}
        onClose={() => {
          setDeleting(null);
        }}
        onDeleted={() => {
          window.setTimeout(() => {
            uploadButtonRef.current?.focus();
          }, FOCUS_AFTER_DIALOG_MS);
        }}
      />
    </SettingsSection>
  );
}
