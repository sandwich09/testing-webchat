'use client';

import { useState } from 'react';

import { copy as commonCopy } from '@/common/common.constants';
import {
  formatDateTime,
  formatInt,
  formatMonthKey,
  formatUsdForScreen,
} from '@/common/common.logic';
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
import type { UsageRecordDto } from '@/contracts';
import { copy } from '@/features/settings/settings.constants';
import { useUsageDetail } from '@/features/settings/settings.hooks';

type UsageDetailDialogProps = {
  /** `YYYY-MM` */
  month: string;
  contact: { id: string; displayName: string } | null;
  onClose: () => void;
};

const SKELETON_ROWS = 6;

/** Display name of a model: the name in the settings copy, or the id when it is not known. */
function modelText(model: string): string {
  return Object.hasOwn(copy.ai.modelOption, model)
    ? copy.ai.modelOption[model as keyof typeof copy.ai.modelOption] // checked by hasOwn above
    : model;
}

function byNewest(a: UsageRecordDto, b: UsageRecordDto): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

const NUMBER_HEAD = 'text-right text-sub';

/** Every model call of one customer in one month (ui-screens 9.10), newest first. */
export function UsageDetailDialog({ month, contact, onClose }: UsageDetailDialogProps) {
  // Keep the last customer while the dialog fades out, so the title does not go blank.
  const [last, setLast] = useState(contact);
  if (contact !== null && contact.id !== last?.id) setLast(contact);
  const shown = contact ?? last;

  const detail = useUsageDetail(shown?.id ?? null, month);
  // Read once per dialog: the times are shown against this moment.
  const [now] = useState(() => new Date());
  const title = copy.usage.detailTitle
    .replace('{name}', shown?.displayName ?? '')
    .replace('{month}', formatMonthKey(month));
  const records = detail.data === undefined ? undefined : [...detail.data].sort(byNewest);

  return (
    <Dialog
      open={contact !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid={testIds.usageDetailDialog}
        showCloseButton={false}
        className="max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[880px]"
      >
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          <DialogDescription className="sr-only">{copy.usage.title}</DialogDescription>
        </DialogHeader>

        {detail.isError ? (
          <ErrorState
            message={copy.usage.detailError}
            onRetry={() => {
              void detail.refetch();
            }}
          />
        ) : records === undefined ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">{commonCopy.loading}</span>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <p className="py-6 text-center text-sub text-muted">{copy.usage.detailEmpty}</p>
        ) : (
          // The box scrolls both ways, so the header row stays at the top of it (sticky).
          <div
            tabIndex={0}
            role="region"
            aria-label={title}
            className="min-h-0 overflow-auto rounded-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-accent-strong/30"
          >
            <table className="w-full min-w-[760px] text-sub">
              <thead>
                <tr className="border-b border-line">
                  {(
                    [
                      [copy.usage.colTime, ''],
                      [copy.usage.colModel, ''],
                      [copy.usage.colInput, NUMBER_HEAD],
                      [copy.usage.colOutput, NUMBER_HEAD],
                      [copy.usage.colCacheRead, NUMBER_HEAD],
                      [copy.usage.colCacheWrite, NUMBER_HEAD],
                      [copy.usage.colCost, NUMBER_HEAD],
                      [copy.usage.colOutcome, ''],
                    ] as const
                  ).map(([label, align]) => (
                    <th
                      key={label}
                      scope="col"
                      className={`sticky top-0 bg-surface px-2 py-2 text-left align-bottom text-sub font-bold ${align}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    data-testid={testIds.usageDetailRow}
                    data-outcome={record.outcome}
                    data-kind={record.kind}
                    className="border-b border-line align-top"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {formatDateTime(record.createdAt, now)}
                    </td>
                    <td className="px-2 py-2">{modelText(record.model)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatInt(record.inputTokens)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatInt(record.outputTokens)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatInt(record.cacheReadTokens)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatInt(record.cacheWriteTokens)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {formatUsdForScreen(record.costUsd)}
                    </td>
                    <td className="px-2 py-2">{copy.usage.outcome[record.outcome]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="default" onClick={onClose} data-testid={testIds.usageDetailClose}>
            {commonCopy.action.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
