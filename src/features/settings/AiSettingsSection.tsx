'use client';

// AI section of the settings page (ui-screens 9.3). Every control saves through its own
// `useUpdateSettings` instance, so pending, success and error belong to that control only.
import { useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn, formatUsdForScreen } from '@/common/common.logic';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { Skeleton } from '@/common/ui/skeleton';
import { Switch } from '@/common/ui/switch';
import { Textarea } from '@/common/ui/textarea';
import { useSettings } from '@/common/common.hooks';
import {
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_MODEL_IDS,
  type AiModelId,
  type SettingsDto,
} from '@/contracts';

import { AiNameRow, ParticleRow } from './AiPersonaRows';
import { parseBudgetInput, validateInstructions } from './settings.logic';
import { copy } from './settings.constants';
import { useUpdateSettings } from './settings.hooks';
import { FieldError, SaveButton, saveFailureText } from './SettingsFormParts';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

// ---------------------------------------------------------------------------
// Pure helpers (unit tested in AiSettingsSection.spec.ts)
// ---------------------------------------------------------------------------

/** Text under the budget field for a result code of `parseBudgetInput`. */
export function budgetErrorText(code: 'budget_invalid' | 'budget_out_of_range'): string {
  if (code === 'budget_invalid') return copy.ai.error.budget_invalid;
  // "10.00" reads as "10" in the sentence; a limit with cents keeps them.
  const max = Number(AI_DAILY_BUDGET_MAX_USD);
  return copy.ai.error.budget_out_of_range.replace(
    '{max}',
    Number.isInteger(max) ? String(max) : AI_DAILY_BUDGET_MAX_USD,
  );
}

/** Text under the instructions field for the result code of `validateInstructions`. */
export function instructionsErrorText(): string {
  return copy.ai.error.instructions_too_long.replace('{max}', String(AI_INSTRUCTIONS_MAX_CHARS));
}

/** Label of the budget line under the field: "วันนี้ใช้ไป $0.00". */
export function budgetTodayText(todayCostUsd: string): string {
  return copy.ai.budgetToday.replace('{used}', formatUsdForScreen(todayCostUsd));
}

/** Counter under the instructions field: "12/2000". */
export function instructionsCounterText(length: number): string {
  return copy.ai.instructionsCounter
    .replace('{n}', String(length))
    .replace('{max}', String(AI_INSTRUCTIONS_MAX_CHARS));
}

/** The text a field shows: what was typed, else what the server saved. */
export function fieldValue(draft: string | null, saved: string): string {
  return draft ?? saved;
}

/** Whether the typed budget differs from the saved one, ignoring surrounding spaces. */
export function budgetDirty(draft: string | null, saved: string): boolean {
  return draft !== null && draft.trim() !== saved;
}

/** Whether the typed instructions differ from the saved ones. */
export function instructionsDirty(draft: string | null, saved: string): boolean {
  return draft !== null && draft !== saved;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const modelOptions = AI_MODEL_IDS.map((id) => ({ value: id, label: copy.ai.modelOption[id] }));

function KillSwitchRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  return (
    <SettingsRow label={copy.ai.killSwitch} description={copy.ai.killSwitchDesc}>
      <Switch
        aria-label={copy.ai.killSwitch}
        aria-busy={mutation.isPending || undefined}
        data-testid={testIds.settingsKillSwitch}
        checked={settings.ai.enabled}
        onCheckedChange={(next) => {
          if (mutation.isPending) return;
          mutation.mutate(
            { aiEnabled: next },
            {
              onSuccess: () => {
                showToast('success', next ? copy.ai.killSwitchOnToast : copy.ai.killSwitchOffToast);
              },
              // The hook already put the old value back in the cache.
              onError: (error) => {
                showToast('error', saveFailureText(error));
              },
            },
          );
        }}
      />
    </SettingsRow>
  );
}

function ModelRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  const labelId = useId();
  const errorId = useId();
  // While saving, show the chosen model; on failure the saved one comes back.
  const shown: AiModelId =
    mutation.isPending && mutation.variables.aiModel !== undefined
      ? mutation.variables.aiModel
      : settings.ai.model;
  return (
    <SettingsRow
      label={copy.ai.model}
      labelId={labelId}
      description={copy.ai.modelDesc}
      layout="column"
    >
      <div className="flex flex-col gap-1">
        <Select
          aria-labelledby={labelId}
          aria-invalid={mutation.isError}
          aria-describedby={mutation.isError ? errorId : undefined}
          pending={mutation.isPending}
          testId={testIds.settingsModel}
          optionTestId={testIds.settingsModelOption}
          className="w-full"
          options={modelOptions}
          value={shown}
          onValueChange={(next) => {
            if (mutation.isPending) return;
            mutation.mutate(
              { aiModel: next },
              {
                onSuccess: () => {
                  showToast('success', commonCopy.toast.saved);
                },
              },
            );
          }}
        />
        <FieldError
          id={errorId}
          message={mutation.isError ? saveFailureText(mutation.error) : null}
        />
      </div>
    </SettingsRow>
  );
}

function BudgetRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [rejected, setRejected] = useState<'budget_invalid' | 'budget_out_of_range' | null>(null);
  const todayId = useId();
  const errorId = useId();

  const saved = settings.ai.dailyBudgetUsd;
  const value = fieldValue(draft, saved);
  const dirty = budgetDirty(draft, saved);
  const errorText =
    rejected !== null
      ? budgetErrorText(rejected)
      : mutation.isError
        ? saveFailureText(mutation.error)
        : null;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!dirty || mutation.isPending) return;
    const parsed = parseBudgetInput(value);
    if (!parsed.ok) {
      setRejected(parsed.code);
      inputRef.current?.focus();
      return;
    }
    setRejected(null);
    mutation.mutate(
      { aiDailyBudgetUsd: value.trim() },
      {
        onSuccess: () => {
          setDraft(null);
          showToast('success', commonCopy.toast.saved);
          // The save button turns disabled; keep focus where the admin was working.
          inputRef.current?.focus();
        },
        onError: () => {
          inputRef.current?.focus();
        },
      },
    );
  };

  return (
    <SettingsRow label={copy.ai.budget} description={copy.ai.budgetDesc} layout="column">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-body text-muted"
            >
              $
            </span>
            <Input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label={copy.ai.budget}
              aria-invalid={errorText !== null || undefined}
              aria-describedby={errorText !== null ? `${errorId} ${todayId}` : todayId}
              data-testid={testIds.settingsBudget}
              className="pl-7 tabular-nums"
              value={value}
              onChange={(event) => {
                setDraft(event.target.value);
                setRejected(null);
                if (mutation.isError) mutation.reset();
              }}
            />
          </div>
          <SaveButton
            pending={mutation.isPending}
            dirty={dirty}
            testId={testIds.settingsBudgetSave}
          />
        </div>
        <p id={todayId} data-testid={testIds.settingsBudgetToday} className="text-sub text-muted">
          {budgetTodayText(settings.ai.todayCostUsd)}
        </p>
        <FieldError id={errorId} message={errorText} />
      </form>
    </SettingsRow>
  );
}

function InstructionsRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const counterId = useId();
  const errorId = useId();

  const saved = settings.ai.instructions;
  const value = fieldValue(draft, saved);
  const dirty = instructionsDirty(draft, saved);
  const tooLong = !validateInstructions(value).ok;
  const errorText = tooLong
    ? instructionsErrorText()
    : mutation.isError
      ? saveFailureText(mutation.error)
      : null;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!dirty || mutation.isPending) return;
    if (tooLong) {
      areaRef.current?.focus();
      return;
    }
    mutation.mutate(
      { aiInstructions: value },
      {
        onSuccess: () => {
          setDraft(null);
          showToast('success', commonCopy.toast.saved);
          areaRef.current?.focus();
        },
        onError: () => {
          areaRef.current?.focus();
        },
      },
    );
  };

  return (
    <SettingsRow
      label={copy.ai.instructions}
      description={copy.ai.instructionsDesc}
      layout="stacked"
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={areaRef}
          rows={4}
          aria-label={copy.ai.instructions}
          aria-invalid={errorText !== null || undefined}
          aria-describedby={errorText !== null ? `${errorId} ${counterId}` : counterId}
          autoComplete="off"
          placeholder={copy.ai.instructionsPlaceholder}
          data-testid={testIds.settingsInstructions}
          className="max-h-[19rem] min-h-[7.5rem] resize-y"
          value={value}
          onChange={(event) => {
            setDraft(event.target.value);
            if (mutation.isError) mutation.reset();
          }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <FieldError id={errorId} message={errorText} />
          </div>
          <p
            id={counterId}
            className={cn('shrink-0 text-meta', tooLong ? 'text-danger' : 'text-muted')}
          >
            {instructionsCounterText(value.length)}
          </p>
        </div>
        <div className="flex justify-end">
          <SaveButton
            pending={mutation.isPending}
            dirty={dirty}
            testId={testIds.settingsInstructionsSave}
          />
        </div>
      </form>
    </SettingsRow>
  );
}

function AiSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {commonCopy.loading}
      </span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex min-h-16 items-center gap-6 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Body of an AI card: the rows once the settings are loaded, else the error or the skeleton. */
function AiCardBody({
  rows,
  children,
}: {
  rows: number;
  children: (settings: SettingsDto) => ReactNode;
}) {
  const query = useSettings();
  const settings = query.data;
  if (settings !== undefined) {
    // The other controls stay editable when the kill switch is off: the values are kept for when
    // it is turned on again. `data-ai-enabled` follows the (optimistic) switch.
    return <div data-ai-enabled={settings.ai.enabled}>{children(settings)}</div>;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={commonCopy.error.section}
        code={errorCodeOf(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  return <AiSkeleton rows={rows} />;
}

/** Card "การทำงาน" of the AI tab (ui-screens 9.3): kill switch, model and daily budget. */
export function AiSettingsSection() {
  const query = useSettings();
  return (
    <SettingsSection
      title={copy.ai.title}
      testId={testIds.settingsSectionAi}
      onRetry={() => {
        void query.refetch();
      }}
    >
      <AiCardBody rows={3}>
        {(settings) => (
          <>
            <KillSwitchRow settings={settings} />
            <ModelRow settings={settings} />
            <BudgetRow settings={settings} />
          </>
        )}
      </AiCardBody>
    </SettingsSection>
  );
}

/** Card "ตัวตนและน้ำเสียง" of the AI tab (ui-screens 9.3): AI name, particle and instructions. */
export function AiPersonaSection() {
  const query = useSettings();
  return (
    <SettingsSection
      title={copy.ai.personaTitle}
      testId={testIds.settingsSectionAiPersona}
      onRetry={() => {
        void query.refetch();
      }}
    >
      <AiCardBody rows={3}>
        {(settings) => (
          <>
            <AiNameRow settings={settings} />
            <ParticleRow settings={settings} />
            <InstructionsRow settings={settings} />
          </>
        )}
      </AiCardBody>
    </SettingsSection>
  );
}
