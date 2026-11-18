'use client';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { formatInt } from '@/common/common.logic';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import type { GuardrailStatsDto } from '@/contracts';

import { useGuardrailStats } from './guard.hooks';
import {
  fillTemplate,
  guardrailRows,
  type GuardrailMetric,
  type GuardrailRow,
} from './guard.logic';
import { copy } from './settings.constants';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

/** What each metric counts, shown as the label of its row. */
const METRIC_LABEL: Record<GuardrailMetric, string> = {
  aiEnabled: copy.guardrails.aiSwitch,
  guardBlocked: copy.guardrails.guard,
  nonText: copy.guardrails.nonText,
  outputRejected: copy.guardrails.outputRejected,
  noTools: copy.guardrails.action,
  handoffNotInKnowledge: copy.guardrails.handoffNotInKnowledge,
  handoffNeedsHuman: copy.guardrails.handoffNeedsHuman,
  handoffFailedOrTimeout: copy.guardrails.handoffFailed,
  handoffOther: copy.guardrails.handoffOther,
  budgetReached: copy.guardrails.budget,
};

/** The value of a row as words, so no status is told by colour alone. */
function valueText(row: GuardrailRow, stats: GuardrailStatsDto): string {
  if (row.metric === 'noTools') return copy.guardrails.actionValue;
  if (typeof row.value === 'boolean') return row.value ? copy.guardrails.on : copy.guardrails.off;
  const n = formatInt(row.value ?? 0);
  if (row.metric === 'guardBlocked') {
    return stats.guardEnabled ? fillTemplate(copy.guardrails.guardOn, { n }) : copy.guardrails.off;
  }
  return fillTemplate(copy.guardrails.times, { n });
}

function GuardrailsSkeleton() {
  return (
    <div aria-busy="true" aria-label={commonCopy.loading}>
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="flex min-h-16 items-center justify-between gap-6 py-3.5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * The Guardrails panel (ui-screens 9.14): today's number for each layer of protection, read only.
 * It shows counts and states only, never prompts, secrets or customer text.
 */
export function GuardrailsSection() {
  const query = useGuardrailStats();
  const stats = query.data;

  return (
    <SettingsSection
      title={copy.guardrails.title}
      testId={testIds.settingsSectionGuardrails}
      onRetry={() => void query.refetch()}
    >
      <p className="text-sub text-muted">{copy.guardrails.description}</p>
      {stats !== undefined ? (
        <>
          <div className="mt-2">
            {guardrailRows(stats).map((row) => (
              <div
                key={row.metric}
                data-testid={testIds.guardrailsRow}
                data-layer={row.layer}
                data-metric={row.metric}
                className="border-b border-line last:border-b-0"
              >
                <SettingsRow
                  label={METRIC_LABEL[row.metric]}
                  description={copy.guardrails.layer[row.layer]}
                  className="border-b-0"
                >
                  <span
                    data-testid={testIds.guardrailsValue}
                    className="text-body font-bold tabular-nums"
                  >
                    {valueText(row, stats)}
                  </span>
                </SettingsRow>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sub text-muted">{copy.guardrails.note}</p>
        </>
      ) : query.isError ? (
        <ErrorState
          message={copy.guardrails.error}
          code={errorCodeOf(query.error)}
          onRetry={() => void query.refetch()}
          testId={testIds.guardrailsError}
        />
      ) : (
        <GuardrailsSkeleton />
      )}
    </SettingsSection>
  );
}
