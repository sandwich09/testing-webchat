'use client';

// AI section of the settings page (ui-screens 9.3). Every control saves through its own
// `useUpdateSettings` instance, so pending, success and error belong to that control only.
import { Check } from 'lucide-react';
import { useId, useRef, useState, type SyntheticEvent, type KeyboardEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn, formatUsdForScreen } from '@/common/common.logic';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
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
  POLITE_PARTICLES,
  type AiModelId,
  type PoliteParticle,
  type SettingsDto,
} from '@/contracts';

import { AiAnswerModeRow, AiNameRow } from './AiPersonaRows';
import { parseBudgetInput, validateInstructions } from './settings.logic';
import { copy } from './settings.constants';
import { useUpdateSettings } from './settings.hooks';
import { FieldError, nextRadioIndex, SaveButton, saveFailureText } from './SettingsFormParts';
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

/** `copy.ai.particleOption` key of a particle value. */
export function particleLabel(particle: PoliteParticle): string {
  return particle === 'ค่ะ' ? copy.ai.particleOption.ka : copy.ai.particleOption.krub;
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
      wideControl
    >
      <div className="flex flex-col items-start gap-1 medium:items-end">
        <Select
          aria-labelledby={labelId}
          aria-invalid={mutation.isError}
          aria-describedby={mutation.isError ? errorId : undefined}
          pending={mutation.isPending}
          testId={testIds.settingsModel}
          optionTestId={testIds.settingsModelOption}
          className="w-full medium:w-[220px]"
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
          // The save button goes away; keep focus where the admin was working.
          inputRef.current?.focus();
        },
        onError: () => {
          inputRef.current?.focus();
        },
      },
    );
  };

  return (
    <SettingsRow label={copy.ai.budget} description={copy.ai.budgetDesc} wideControl>
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col items-start gap-1 medium:items-end"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-body text-muted">
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
            className="w-[120px]"
            value={value}
            onChange={(event) => {
              setDraft(event.target.value);
              setRejected(null);
              if (mutation.isError) mutation.reset();
            }}
          />
          {dirty ? (
            <SaveButton pending={mutation.isPending} testId={testIds.settingsBudgetSave} />
          ) : null}
        </div>
        <p id={todayId} data-testid={testIds.settingsBudgetToday} className="text-sub text-muted">
          {budgetTodayText(settings.ai.todayCostUsd)}
        </p>
        <FieldError id={errorId} message={errorText} />
      </form>
    </SettingsRow>
  );
}

function ParticleRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  const errorId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown: PoliteParticle =
    mutation.isPending && mutation.variables.aiPoliteParticle !== undefined
      ? mutation.variables.aiPoliteParticle
      : settings.ai.politeParticle;

  const choose = (next: PoliteParticle) => {
    if (mutation.isPending || next === settings.ai.politeParticle) return;
    mutation.mutate(
      { aiPoliteParticle: next },
      {
        onSuccess: () => {
          showToast('success', commonCopy.toast.saved);
        },
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const target = nextRadioIndex(event.key, index, POLITE_PARTICLES.length);
    if (target === null) return;
    event.preventDefault();
    const particle = POLITE_PARTICLES[target];
    if (particle === undefined) return;
    refs.current[target]?.focus();
    choose(particle);
  };

  return (
    <SettingsRow label={copy.ai.particle} description={copy.ai.particleDesc}>
      <div className="flex flex-col items-end gap-1">
        <div
          role="radiogroup"
          aria-label={copy.ai.particle}
          aria-describedby={mutation.isError ? errorId : undefined}
          data-testid={testIds.settingsParticle}
          className="flex gap-2"
        >
          {POLITE_PARTICLES.map((particle, index) => {
            const checked = particle === shown;
            return (
              <Button
                key={particle}
                ref={(node: HTMLButtonElement | null) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-value={particle}
                className={cn('min-w-[72px]', checked && 'border-accent-strong bg-selected')}
                onClick={() => {
                  choose(particle);
                }}
                onKeyDown={(event) => {
                  onKeyDown(event, index);
                }}
              >
                {checked ? <Check aria-hidden="true" /> : null}
                {particleLabel(particle)}
              </Button>
            );
          })}
        </div>
        <FieldError
          id={errorId}
          message={mutation.isError ? saveFailureText(mutation.error) : null}
        />
      </div>
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
      wideControl
      className="medium:flex-col medium:items-stretch"
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
        {dirty ? (
          <div className="flex justify-end">
            <SaveButton pending={mutation.isPending} testId={testIds.settingsInstructionsSave} />
          </div>
        ) : null}
      </form>
    </SettingsRow>
  );
}

function AiSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {commonCopy.loading}
      </span>
      {[0, 1, 2, 3, 4, 5, 6].map((row) => (
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

/**
 * AI settings (ui-screens 9.3): kill switch, model, daily budget, particle, AI name, answer scope
 * and custom instructions.
 */
export function AiSettingsSection() {
  const query = useSettings();
  const settings = query.data;
  return (
    <SettingsSection
      title={copy.ai.title}
      testId={testIds.settingsSectionAi}
      onRetry={() => {
        void query.refetch();
      }}
    >
      {settings !== undefined ? (
        // The other controls stay editable when the kill switch is off: the values are kept for
        // when it is turned on again. `data-ai-enabled` follows the (optimistic) switch.
        <div data-ai-enabled={settings.ai.enabled}>
          <KillSwitchRow settings={settings} />
          <ModelRow settings={settings} />
          <BudgetRow settings={settings} />
          <ParticleRow settings={settings} />
          <AiNameRow settings={settings} />
          <AiAnswerModeRow settings={settings} />
          <InstructionsRow settings={settings} />
        </div>
      ) : query.isError ? (
        <ErrorState
          message={commonCopy.error.section}
          code={errorCodeOf(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <AiSkeleton />
      )}
    </SettingsSection>
  );
}
