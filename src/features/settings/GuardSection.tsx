'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type SyntheticEvent, type ReactNode } from 'react';

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
import { GUARD_MAX_TOPICS, type SettingsDto } from '@/contracts';

import { GuardTestBox } from './GuardTestBox';
import { copy } from './settings.constants';
import { useUpdateGuardSettings } from './settings.guard.hooks';
import {
  addGuardTopic,
  fillTemplate,
  focusAfterTopicRemoved,
  guardErrorText,
  removeGuardTopic,
} from './settings.guard.logic';
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
    <div className="flex flex-col gap-3 py-3">
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
  const topics = settings.guard.topics;
  // What is being typed; it stays after a failed save and clears when the topic is saved.
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<FieldError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const removeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<number | 'input' | null>(null);
  const ids = { label: useId(), description: useId(), error: useId(), counter: useId() };

  // Focus moves once the list has rendered its new rows.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === 'input') inputRef.current?.focus();
    else removeRefs.current[target]?.focus();
  }, [topics]);

  const save = (next: string[], onSaved: () => void) => {
    update.mutate(
      { guardTopics: next },
      {
        onSuccess: () => {
          onSaved();
          showToast('success', commonCopy.toast.saved);
        },
        onError: (failure) => {
          setError(saveError(failure));
          inputRef.current?.focus();
        },
      },
    );
  };

  const add = (event: SyntheticEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    const check = addGuardTopic(topics, typed);
    if (!check.ok) {
      setError({ code: check.code, text: guardErrorText(check.code) });
      inputRef.current?.focus();
      return;
    }
    setError(null);
    pendingFocus.current = 'input';
    save(check.topics, () => {
      setTyped('');
    });
  };

  const remove = (index: number) => {
    if (update.isPending) return;
    const check = removeGuardTopic(topics, index, settings.guard.enabled);
    if (!check.ok) {
      setError({ code: check.code, text: guardErrorText(check.code) });
      return;
    }
    setError(null);
    pendingFocus.current = focusAfterTopicRemoved(topics.length, index) ?? 'input';
    save(check.topics, () => undefined);
  };

  return (
    <FieldRow
      label={copy.guard.topics}
      description={copy.guard.topicsDesc}
      labelId={ids.label}
      descriptionId={ids.description}
    >
      <form onSubmit={add} noValidate className="flex items-start gap-2">
        <Input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          placeholder={copy.guard.topicsPlaceholder}
          aria-label={copy.guard.topicInput}
          aria-describedby={
            error === null
              ? `${ids.description} ${ids.counter}`
              : `${ids.error} ${ids.description} ${ids.counter}`
          }
          aria-invalid={error !== null || undefined}
          autoComplete="off"
          data-testid={testIds.guardTopicInput}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          aria-disabled={update.isPending || undefined}
          data-testid={testIds.guardTopicAdd}
          className="medium:h-10"
        >
          <Plus aria-hidden="true" />
          {copy.guard.topicAdd}
        </Button>
      </form>
      <FieldErrorText id={ids.error} testId={testIds.guardTopicsError} error={error} />
      {topics.length === 0 ? (
        <p className="mt-3 text-sub text-muted">{copy.guard.topicsEmpty}</p>
      ) : (
        <ul
          aria-labelledby={ids.label}
          data-testid={testIds.guardTopics}
          className="mt-3 flex flex-col gap-1.5"
        >
          {topics.map((topic, index) => (
            <li
              key={topic}
              data-testid={testIds.guardTopic}
              data-topic={topic}
              className="flex min-h-11 items-center gap-2 rounded-[13px] bg-rail py-1 pr-1 pl-3.5 medium:min-h-10"
            >
              <span className="min-w-0 flex-1 py-0.5 text-body break-words">{topic}</span>
              <Button
                ref={(node: HTMLButtonElement | null) => {
                  removeRefs.current[index] = node;
                }}
                type="button"
                variant="ghost"
                size="sm"
                aria-label={fillTemplate(copy.guard.topicRemoveAria, { topic })}
                aria-disabled={update.isPending || undefined}
                data-testid={testIds.guardTopicRemove}
                onClick={() => {
                  remove(index);
                }}
              >
                <X aria-hidden="true" />
                <span aria-hidden="true" className="hidden medium:inline">
                  {copy.guard.topicRemove}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p
        id={ids.counter}
        data-testid={testIds.guardTopicsCounter}
        className="mt-2 text-meta text-muted tabular-nums"
      >
        {fillTemplate(copy.guard.topicsCounter, { n: topics.length, max: GUARD_MAX_TOPICS })}
      </p>
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
