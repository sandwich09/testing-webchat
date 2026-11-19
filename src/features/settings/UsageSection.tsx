'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { copy as commonCopy } from '@/common/common.constants';
import { useHydrated } from '@/common/common.hooks';
import { formatInt, formatUsdForScreen } from '@/common/common.logic';
import { ContactAvatar } from '@/common/ContactAvatar';
import { EmptyState } from '@/common/EmptyState';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/common/ui/table';
import { UsageDetailDialog } from '@/features/settings/UsageDetailDialog';
import type { UsageReport } from '@/features/settings/settings.api';
import { copy } from '@/features/settings/settings.constants';
import { useUsage } from '@/features/settings/settings.hooks';
import { monthOptions, usageTokenTotal } from '@/features/settings/settings.logic';
import { SettingsRow } from '@/features/settings/SettingsRow';
import { SettingsSection } from '@/features/settings/SettingsSection';

const SKELETON_ROWS = 4;
const DASH = '—';

type DetailTarget = { id: string; displayName: string };

const SELECT_CLASS =
  'h-11 w-full rounded-[13px] border border-line bg-surface px-3 text-[16px] text-fg outline-none medium:h-10 medium:w-auto medium:text-[15px] focus-visible:border-accent-strong focus-visible:ring-[3px] focus-visible:ring-accent-strong/30';

const NUM_HEAD = 'text-right text-sub font-normal text-muted';

function Report({
  report,
  onOpen,
}: {
  report: UsageReport;
  onOpen: (target: DetailTarget) => void;
}) {
  const { contacts, ingest, guard } = report;
  const isEmpty =
    contacts.length === 0 && ingest.count === 0 && guard.count === 0 && report.replyCount === 0;
  const disclaimer = (
    <p data-testid={testIds.usageDisclaimer} className="text-sub text-muted">
      {copy.usage.disclaimer.replace('{date}', report.priceTableDate)}
    </p>
  );

  if (isEmpty) {
    return (
      <>
        <EmptyState title={copy.usage.empty} testId={testIds.usageEmpty} />
        {disclaimer}
      </>
    );
  }

  const average =
    report.averageCostPerReplyUsd === null
      ? DASH
      : formatUsdForScreen(report.averageCostPerReplyUsd);

  return (
    <>
      <Table data-testid={testIds.usageTable} className="min-w-[520px]">
        <TableCaption className="sr-only">{copy.usage.title}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="min-w-[160px] text-sub font-normal text-muted">
              {copy.usage.colContact}
            </TableHead>
            <TableHead scope="col" className={NUM_HEAD}>
              {copy.usage.colReplies}
            </TableHead>
            <TableHead scope="col" className={NUM_HEAD}>
              {copy.usage.colTokens}
            </TableHead>
            <TableHead scope="col" className={NUM_HEAD}>
              {copy.usage.colCost}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((row, index) => {
            const name = row.displayName ?? DASH;
            return (
              <TableRow
                key={row.contactId ?? `none-${String(index)}`}
                data-testid={testIds.usageRow}
                data-contact-id={row.contactId ?? undefined}
                // The button of the name cell stretches over the whole row (::after below).
                className="relative border-line focus-within:bg-selected"
              >
                <TableCell className="py-3">
                  <span className="flex items-center gap-2.5">
                    <ContactAvatar
                      name={name}
                      pictureUrl={row.pictureUrl}
                      contactId={row.contactId ?? name}
                      size={28}
                    />
                    {row.contactId === null ? (
                      <span className="max-w-[240px] truncate py-0.5">{name}</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={copy.usage.openDetail.replace('{name}', name)}
                        onClick={() => {
                          if (row.contactId !== null) {
                            onOpen({ id: row.contactId, displayName: name });
                          }
                        }}
                        className="max-w-[240px] truncate py-0.5 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-accent-strong/60 focus-visible:after:ring-inset"
                      >
                        {name}
                      </button>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">
                  {formatInt(row.replyCount)}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">
                  {formatInt(row.totalTokens)}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">
                  {formatUsdForScreen(row.costUsd)}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow
            data-testid={testIds.usageRowIngest}
            className="border-line hover:bg-transparent"
          >
            <TableCell className="py-3">{copy.usage.ingestRow}</TableCell>
            <TableCell className="py-3 text-right">{DASH}</TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatInt(ingest.totalTokens)}
            </TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatUsdForScreen(ingest.costUsd)}
            </TableCell>
          </TableRow>
          <TableRow
            data-testid={testIds.usageRowGuard}
            className="border-line hover:bg-transparent"
          >
            <TableCell className="py-3">
              <span className="flex flex-col">
                <span>{copy.usage.guardRow}</span>
                <span className="text-sub text-muted">
                  {copy.usage.guardCount.replace('{n}', formatInt(guard.count))}
                </span>
              </span>
            </TableCell>
            <TableCell className="py-3 text-right">{DASH}</TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatInt(guard.totalTokens)}
            </TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatUsdForScreen(guard.costUsd)}
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter className="border-t border-fg bg-transparent">
          <TableRow data-testid={testIds.usageTotal} className="border-0 hover:bg-transparent">
            <TableCell className="py-3">{copy.usage.total}</TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatInt(report.replyCount)}
            </TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatInt(usageTokenTotal(report))}
            </TableCell>
            <TableCell className="py-3 text-right tabular-nums">
              {formatUsdForScreen(report.totalCostUsd)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p data-testid={testIds.usageAvg} className="pt-3 text-sub text-muted">
        {copy.usage.avgPerReply.replace('{usd}', average)}
      </p>
      {report.noResponseCount > 0 ? (
        <p data-testid={testIds.usageNoResponse} className="pt-1 text-sub text-muted">
          {copy.usage.noResponse.replace('{n}', formatInt(report.noResponseCount))}
        </p>
      ) : null}
      {disclaimer}
    </>
  );
}

/** AI cost section: month picker, per-customer table, file reading and screening rows, totals (ui-screens 9.9). */
export function UsageSection() {
  // The months come from the browser's clock, so they render after hydration (the server's clock
  // can be in another month); until then the select is empty and the report shows its skeleton.
  const hydrated = useHydrated();
  const options = useMemo(() => (hydrated ? monthOptions(new Date()) : []), [hydrated]);
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked ?? options[0]?.value ?? '';
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const usage = useUsage(month);

  let body: ReactNode;
  if (usage.data === undefined && usage.isError) {
    body = (
      <ErrorState
        message={copy.usage.error}
        onRetry={() => {
          void usage.refetch();
        }}
      />
    );
  } else if (usage.data === undefined) {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-3 py-2">
        <span className="sr-only">{commonCopy.loading}</span>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  } else {
    body = <Report report={usage.data} onOpen={setDetail} />;
  }

  return (
    <SettingsSection
      title={copy.usage.title}
      testId={testIds.settingsSectionUsage}
      onRetry={() => {
        void usage.refetch();
      }}
    >
      <SettingsRow>
        <select
          aria-label={copy.usage.monthLabel}
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
          }}
          data-testid={testIds.usageMonth}
          className={SELECT_CLASS}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingsRow>
      {body}
      <UsageDetailDialog
        month={month}
        contact={detail}
        onClose={() => {
          setDetail(null);
        }}
      />
    </SettingsSection>
  );
}
