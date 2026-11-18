'use client';

import { useId, useState, type SyntheticEvent, type ReactNode } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { useSettings } from '@/common/common.hooks';
import { formatInt } from '@/common/common.logic';
import { ErrorState } from '@/common/ErrorState';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Skeleton } from '@/common/ui/skeleton';
import { Switch } from '@/common/ui/switch';
import { Textarea } from '@/common/ui/textarea';
import { GUARD_MAX_TOPICS, GUARD_REFUSAL_MAX_CHARS, type SettingsDto } from '@/contracts';

import { useUpdateGuardSettings } from './guard.hooks';
import {
  countGuardTopicLines,
  fillTemplate,
  guardErrorText,
  guardTopicsToText,
  validateGuardRefusal,
  validateGuardTopicsInput,
} from './guard.logic';
import { GuardTestBox } from './GuardTestBox';
import { copy } from './settings.constants';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

/** An error shown under a control: Thai text and the code for `data-code`. */
type FieldError = { code: string; text: string };

/** A failed save of a field. What was typed stays, so the message says it is still there. */
function saveError(error: unknown): FieldError {
  const code = errorCodeOf(error);
  return {
    code,
    text:
      errorMessage(code, { variant: 'form' }) ??
      errorMessage('internal.unexpected', { variant: 'form' }) ??
      commonCopy.error.section,
  };
}

function FieldErrorText({
  id,
  testId,
  error,
}: {
  id: string;
  testId: string;
  error: FieldError | null;
}) {
  if (error === null) return null;
  return (
    <p
      id={id}
      role="alert"
      data-testid={testId}
      data-code={error.code}
      className="mt-2 text-sub text-danger"
    >
      {error.text}
    </p>
  );
}

/** A row whose control takes the full width under the label, on every screen width (ui-screens 9.3). */
function FieldRow({
  label,
  description,
  labelId,
  descriptionId,
  children,
}: {
  label: string;
  description: string;
  labelId: string;
  descriptionId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-3.5">
      <div>
        <p id={labelId} className="text-body font-bold">
          {label}
        </p>
        <p id={descriptionId} className="text-sub text-muted">
          {description}
        </p>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}

function SaveButton({
  pending,
  testId,
  onClick,
}: {
  pending: boolean;
  testId: string;
  onClick?: () => void;
}) {
  return (
    <Button
      type={onClick === undefined ? 'submit' : 'button'}
      onClick={onClick}
      aria-disabled={pending || undefined}
      data-testid={testId}
    >
      {commonCopy.action.save}
    </Button>
  );
}

function GuardSwitchRow({ settings }: { settings: SettingsDto }) {
  const update = useUpdateGuardSettings();
  const [error, setError] = useState<FieldError | null>(null);
  const errorId = useId();

  const change = (next: boolean) => {
    if (update.isPending) return;
    setError(null);
    // Without a saved topic the switch cannot go on, and the server is not asked.
    if (next && settings.guard.topics.length === 0) {
      setError({ code: 'topics_required', text: guardErrorText('topics_required') });
      return;
    }
    update.mutate(
      { guardEnabled: next },
      {
        onSuccess: () => {
          showToast('success', next ? copy.guard.enabledToast : copy.guard.disabledToast);
        },
        onError: (failure) => {
          setError(saveError(failure));
        },
      },
    );
  };

  return (
    <>
      <SettingsRow label={copy.guard.switch} description={copy.guard.switchDesc}>
        <Switch
          checked={settings.guard.enabled}
          onCheckedChange={change}
          aria-label={copy.guard.switch}
          aria-describedby={error === null ? undefined : errorId}
          data-testid={testIds.guardSwitch}
        />
      </SettingsRow>
      <FieldErrorText id={errorId} testId={testIds.guardSwitchError} error={error} />
    </>
  );
}

function TopicsRow({ settings }: { settings: SettingsDto }) {
  const update = useUpdateGuardSettings();
  const saved = guardTopicsToText(settings.guard.topics);
  // `null` follows the saved topics; a string is what the admin typed and has not saved yet.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<FieldError | null>(null);
  const ids = { label: useId(), description: useId(), error: useId() };

  const value = draft ?? saved;
  const dirty = draft !== null;

  const save = () => {
    if (update.isPending) return;
    const check = validateGuardTopicsInput(value, settings.guard.enabled);
    if (!check.ok) {
      setError({ code: check.code, text: guardErrorText(check.code) });
      return;
    }
    setError(null);
    update.mutate(
      { guardTopics: check.topics },
      {
        onSuccess: () => {
          setDraft(null);
          showToast('success', commonCopy.toast.saved);
        },
        onError: (failure) => {
          setError(saveError(failure));
        },
      },
    );
  };

  return (
    <FieldRow
      label={copy.guard.topics}
      description={copy.guard.topicsDesc}
      labelId={ids.label}
      descriptionId={ids.description}
    >
      <Textarea
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next === saved ? null : next);
          setError(null);
        }}
        placeholder={copy.guard.topicsPlaceholder}
        aria-labelledby={ids.label}
        aria-describedby={error === null ? ids.description : `${ids.description} ${ids.error}`}
        aria-invalid={error !== null || undefined}
        data-testid={testIds.guardTopics}
        className="max-h-[18.5rem] min-h-[7.5rem] overflow-y-auto"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          data-testid={testIds.guardTopicsCounter}
          className="text-meta text-muted tabular-nums"
        >
          {fillTemplate(copy.guard.topicsCounter, {
            n: countGuardTopicLines(value),
            max: GUARD_MAX_TOPICS,
          })}
        </span>
        {dirty ? (
          <SaveButton pending={update.isPending} testId={testIds.guardTopicsSave} onClick={save} />
        ) : null}
      </div>
      <FieldErrorText id={ids.error} testId={testIds.guardTopicsError} error={error} />
    </FieldRow>
  );
}

function RefusalRow({ settings }: { settings: SettingsDto }) {
  const update = useUpdateGuardSettings();
  const saved = settings.guard.refusalText;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<FieldError | null>(null);
  const ids = { label: useId(), description: useId(), error: useId() };

  const value = draft ?? saved;
  const dirty = draft !== null;

  const save = (event: SyntheticEvent) => {
    event.preventDefault();
    if (update.isPending || !dirty) return;
    const check = validateGuardRefusal(value);
    if (!check.ok) {
      setError({ code: check.code, text: guardErrorText(check.code) });
      return;
    }
    setError(null);
    update.mutate(
      { guardRefusalText: value.trim() },
      {
        onSuccess: () => {
          setDraft(null);
          showToast('success', commonCopy.toast.saved);
        },
        onError: (failure) => {
          setError(saveError(failure));
        },
      },
    );
  };

  return (
    <FieldRow
      label={copy.guard.refusal}
      description={copy.guard.refusalDesc}
      labelId={ids.label}
      descriptionId={ids.description}
    >
      <form onSubmit={save} noValidate>
        <Input
          type="text"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next === saved ? null : next);
            setError(null);
          }}
          aria-labelledby={ids.label}
          aria-describedby={error === null ? ids.description : `${ids.description} ${ids.error}`}
          aria-invalid={error !== null || undefined}
          data-testid={testIds.guardRefusal}
          className="medium:h-11"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-meta text-muted tabular-nums">
            {fillTemplate(copy.guard.refusalCounter, {
              n: value.length,
              max: GUARD_REFUSAL_MAX_CHARS,
            })}
          </span>
          {dirty ? (
            <SaveButton pending={update.isPending} testId={testIds.guardRefusalSave} />
          ) : null}
        </div>
        <FieldErrorText id={ids.error} testId={testIds.guardRefusalError} error={error} />
      </form>
    </FieldRow>
  );
}

function GuardTestRow({ settings }: { settings: SettingsDto }) {
  const ids = { label: useId(), description: useId() };
  return (
    <FieldRow
      label={copy.guard.test}
      description={copy.guard.testDesc}
      labelId={ids.label}
      descriptionId={ids.description}
    >
      <GuardTestBox settings={settings} />
    </FieldRow>
  );
}

function GuardSkeleton() {
  return (
    <div aria-busy="true" aria-label={commonCopy.loading} className="flex flex-col gap-4 py-3.5">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/**
 * The topic guard section (ui-screens 9.13). Every control stays editable while the AI switch is
 * off; only the try-a-message box is turned off, with its reason.
 */
export function GuardSection() {
  const query = useSettings();
  const settings = query.data;

  return (
    <SettingsSection
      title={copy.guard.title}
      testId={testIds.settingsSectionGuard}
      onRetry={() => void query.refetch()}
    >
      {settings !== undefined ? (
        <>
          <GuardSwitchRow settings={settings} />
          <TopicsRow settings={settings} />
          <RefusalRow settings={settings} />
          <GuardTestRow settings={settings} />
          <p
            data-testid={testIds.guardBlockedToday}
            className="pt-3.5 text-sub text-muted tabular-nums"
          >
            {fillTemplate(copy.guard.blockedToday, { n: formatInt(settings.guard.blockedToday) })}
          </p>
        </>
      ) : query.isError ? (
        <ErrorState
          message={
            errorMessage(errorCodeOf(query.error)) ??
            errorMessage('internal.unexpected') ??
            commonCopy.error.section
          }
          onRetry={() => void query.refetch()}
        />
      ) : (
        <GuardSkeleton />
      )}
    </SettingsSection>
  );
}
