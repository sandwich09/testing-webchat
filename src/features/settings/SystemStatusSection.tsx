'use client';

// System status section of the settings page (ui-screens 9.11): read-only rows that tell the admin
// the system is working without opening a log. Nothing here shows cost per message.
import type { ReactNode } from 'react';
import { useState } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn, formatDateTime, formatUsdForScreen } from '@/common/common.logic';
import { errorMessage } from '@/common/error-messages';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import type { SystemStatusDto } from '@/contracts';

import { copy } from './settings.constants';
import { useSystemStatus } from './settings.hooks';
import { kbUsage } from './settings.logic';
import { SettingsSection } from './SettingsSection';

type ErrorEntry = SystemStatusDto['lastLineError'];

// ---------------------------------------------------------------------------
// Pure helpers (unit tested in SystemStatusSection.spec.ts)
// ---------------------------------------------------------------------------

/** "รับ webhook ล่าสุด" value: the date and time, or the never text. */
export function webhookText(iso: string | null, now: Date): string {
  return iso === null ? copy.status.never : formatDateTime(iso, now);
}

/** Value of an error row: "message · time" from the error catalog, or the none text. */
export function errorEntryText(entry: ErrorEntry, now: Date): string {
  if (entry === null) return copy.status.none;
  // A code the catalog shows no text for is shown as the code itself, never as nothing.
  const message = errorMessage(entry.code, { variant: 'settings' }) ?? entry.code;
  return copy.status.errorAt
    .replace('{message}', message)
    .replace('{dateTime}', formatDateTime(entry.at, now));
}

/** Used and limit of a decimal dollar string in millionths of a dollar, so small amounts still count. */
function micros(usd: string): number {
  const value = Number(usd);
  return Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
}

/** Text and meter of today's AI budget. */
export function budgetMeter(
  todayCostUsd: string,
  dailyBudgetUsd: string,
): { text: string; ratio: number; tone: 'normal' | 'warn' | 'full'; used: number; limit: number } {
  const used = micros(todayCostUsd);
  const limit = micros(dailyBudgetUsd);
  const usage = kbUsage({ usedTokens: used, capacityTokens: limit });
  return {
    text: copy.status.budgetValue
      .replace('{used}', formatUsdForScreen(todayCostUsd))
      .replace('{budget}', formatUsdForScreen(dailyBudgetUsd)),
    ratio: Math.min(usage.ratio, 1),
    tone: usage.tone,
    used,
    limit,
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 flex-col justify-center gap-1 border-b border-line py-3.5 last:border-b-0 medium:flex-row medium:items-center medium:gap-6">
      <p className="text-body font-bold medium:flex-1">{label}</p>
      <div className="min-w-0 medium:max-w-[60%] medium:text-right">{children}</div>
    </div>
  );
}

const barColor = { normal: 'bg-accent-strong', warn: 'bg-warn', full: 'bg-danger' } as const;

function StatusBody({ status, now }: { status: SystemStatusDto; now: Date }) {
  const meter = budgetMeter(status.todayCostUsd, status.dailyBudgetUsd);
  return (
    <div>
      <StatusRow label={copy.status.webhook}>
        <p data-testid={testIds.statusWebhook} className="text-body">
          {webhookText(status.lastWebhookAt, now)}
        </p>
      </StatusRow>
      <StatusRow label={copy.status.lineError}>
        <p
          data-testid={testIds.statusLineError}
          data-code={status.lastLineError?.code}
          className={cn('text-body', status.lastLineError === null && 'text-muted')}
        >
          {errorEntryText(status.lastLineError, now)}
        </p>
      </StatusRow>
      <StatusRow label={copy.status.aiError}>
        <p
          data-testid={testIds.statusAiError}
          data-code={status.lastAiError?.code}
          className={cn('text-body', status.lastAiError === null && 'text-muted')}
        >
          {errorEntryText(status.lastAiError, now)}
        </p>
      </StatusRow>
      <StatusRow label={copy.status.budget}>
        <div data-testid={testIds.statusBudget} data-tone={meter.tone} className="space-y-2">
          <p className="text-body">{meter.text}</p>
          <div
            role="meter"
            aria-label={copy.status.budget}
            aria-valuemin={0}
            aria-valuemax={meter.limit}
            aria-valuenow={Math.min(meter.used, meter.limit)}
            aria-valuetext={meter.text}
            className="h-1 w-full overflow-hidden rounded-full bg-line medium:w-[220px]"
          >
            <div
              className={cn('h-full rounded-full', barColor[meter.tone])}
              style={{ width: `${String(Math.round(meter.ratio * 100))}%` }}
            />
          </div>
        </div>
      </StatusRow>
      <StatusRow label={copy.status.database}>
        <p
          data-testid={testIds.statusDb}
          className="flex items-center gap-2 text-body medium:justify-end"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          {copy.status.dbOk}
        </p>
      </StatusRow>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {commonCopy.loading}
      </span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex min-h-16 items-center justify-between gap-6 border-b border-line py-3.5 last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

/** System status (ui-screens 9.11), refreshed every `SYSTEM_STATUS_POLL_MS` by `useSystemStatus`. */
export function SystemStatusSection() {
  const query = useSystemStatus();
  const status = query.data;
  // Only dates are shown; "now" decides whether the Buddhist-era year is added.
  const [now] = useState(() => new Date());
  return (
    <SettingsSection
      title={copy.status.title}
      testId={testIds.settingsSectionStatus}
      onRetry={() => {
        void query.refetch();
      }}
    >
      {status !== undefined ? (
        <StatusBody status={status} now={now} />
      ) : query.isError ? (
        <ErrorState
          message={copy.status.error}
          code={errorCodeOf(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <StatusSkeleton />
      )}
    </SettingsSection>
  );
}
