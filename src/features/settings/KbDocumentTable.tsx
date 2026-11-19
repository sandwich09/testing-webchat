'use client';

import { Loader2 } from 'lucide-react';

import { formatInt } from '@/common/common.logic';
import { errorMessage, type ErrorMessageContext } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/common/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/common/ui/tooltip';
import { PDF_MAX_BYTES, PDF_MAX_PAGES, type DocumentDto } from '@/contracts';
import { copy } from '@/features/settings/settings.constants';

const BYTES_PER_MB = 1024 * 1024;

type KbDocumentTableProps = {
  documents: readonly DocumentDto[];
  /** Tokens of the ready files, from the server; used to work out how far over the cap a file was. */
  usedTokens: number;
  capacityTokens: number;
  /** An upload or retry is running: the row buttons that start one cannot be pressed. */
  busy: boolean;
  onView: (documentId: string) => void;
  onDelete: (document: DocumentDto) => void;
  /** Opens the file picker for this failed file. */
  onRetry: (documentId: string) => void;
};

/** Why a file failed, in the words of the error catalog with the numbers of this row filled in. */
function failureText(doc: DocumentDto, usedTokens: number, capacityTokens: number): string {
  const over = Math.max((doc.tokenCount ?? 0) + usedTokens - capacityTokens, 0);
  const ctx: ErrorMessageContext = {
    variant: 'knowledge',
    pageCount: doc.pageCount ?? '—',
    maxPages: PDF_MAX_PAGES,
    over: formatInt(over),
    size: (doc.sizeBytes / BYTES_PER_MB).toFixed(1),
    maxMb: PDF_MAX_BYTES / BYTES_PER_MB,
  };
  const text = doc.errorCode === null ? null : errorMessage(doc.errorCode, ctx);
  return text ?? errorMessage('internal.unexpected', { variant: 'knowledge' }) ?? '';
}

function StatusCell({
  doc,
  usedTokens,
  capacityTokens,
}: {
  doc: DocumentDto;
  usedTokens: number;
  capacityTokens: number;
}) {
  if (doc.status === 'processing') {
    return (
      <span className="inline-flex items-center gap-2">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        {copy.kb.statusProcessing}
      </span>
    );
  }
  if (doc.status === 'ready') {
    return <span className="font-bold text-success">{copy.kb.statusReady}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-bold text-danger">{copy.kb.statusFailed}</span>
      <span className="max-w-[28ch] text-wrap text-muted">
        {failureText(doc, usedTokens, capacityTokens)}
      </span>
    </span>
  );
}

/** Table of the knowledge files (ui-screens 9.5): name, pages, tokens, status and row buttons. */
export function KbDocumentTable({
  documents,
  usedTokens,
  capacityTokens,
  busy,
  onView,
  onDelete,
  onRetry,
}: KbDocumentTableProps) {
  return (
    <Table data-testid={testIds.kbTable} className="min-w-[620px]">
      <TableCaption className="sr-only">{copy.kb.title}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className="text-sub font-normal text-muted">
            {copy.kb.colFile}
          </TableHead>
          <TableHead scope="col" className="text-right text-sub font-normal text-muted">
            {copy.kb.colPages}
          </TableHead>
          <TableHead scope="col" className="text-right text-sub font-normal text-muted">
            {copy.kb.colTokens}
          </TableHead>
          <TableHead scope="col" className="text-sub font-normal text-muted">
            {copy.kb.colStatus}
          </TableHead>
          {/* The button column has no header text; a <td> keeps axe's empty-table-header quiet. */}
          <td aria-hidden="true" className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow
            key={doc.id}
            data-testid={testIds.kbRow}
            data-document-id={doc.id}
            data-status={doc.status}
            data-file-name={doc.fileName}
            className="border-line align-top"
          >
            <TableCell className="py-3">
              <span className="block max-w-[200px] truncate py-0.5 font-bold" title={doc.fileName}>
                {doc.fileName}
              </span>
            </TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {doc.pageCount === null ? '—' : formatInt(doc.pageCount)}
            </TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {doc.tokenCount === null ? '—' : formatInt(doc.tokenCount)}
            </TableCell>
            <TableCell
              className="py-3 whitespace-normal"
              data-testid={testIds.kbRowStatus}
              data-code={doc.errorCode ?? undefined}
            >
              <StatusCell doc={doc} usedTokens={usedTokens} capacityTokens={capacityTokens} />
            </TableCell>
            <TableCell className="py-2">
              <span className="flex justify-end gap-2">
                {doc.status === 'ready' ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      onView(doc.id);
                    }}
                    data-testid={testIds.kbRowView}
                  >
                    {copy.kb.view}
                  </Button>
                ) : null}
                {doc.status === 'failed' ? (
                  <>
                    <span id={`kb-retry-hint-${doc.id}`} className="sr-only">
                      {copy.kb.retryHint}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          disabled={busy}
                          aria-describedby={`kb-retry-hint-${doc.id}`}
                          onClick={() => {
                            onRetry(doc.id);
                          }}
                          data-testid={testIds.kbRowRetry}
                        >
                          {copy.kb.retry}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{copy.kb.retryHint}</TooltipContent>
                    </Tooltip>
                  </>
                ) : null}
                {doc.status !== 'processing' ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      onDelete(doc);
                    }}
                    data-testid={testIds.kbRowDelete}
                  >
                    {copy.kb.delete}
                  </Button>
                ) : null}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
