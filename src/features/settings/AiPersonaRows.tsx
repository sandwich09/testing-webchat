'use client';

// The AI name and answer scope rows of the AI section (ui-screens 9.3). Each row saves through its
// own `useUpdateSettings` instance, like the other rows of the section.
import { Check } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';

import { copy as commonCopy } from '@/common/common.constants';
import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import {
  AI_ANSWER_MODES,
  AI_NAME_MAX_CHARS,
  type AiAnswerMode,
  type SettingsDto,
} from '@/contracts';

import { copy } from './settings.constants';
import { useUpdateSettings } from './settings.hooks';
import { validateAiName } from './settings.logic';
import { FieldError, nextRadioIndex, SaveButton, saveFailureText } from './SettingsFormParts';
import { SettingsRow } from './SettingsRow';

/** Text under the name field when it is too long. */
export function aiNameErrorText(): string {
  return copy.ai.error.ai_name_too_long.replace('{max}', String(AI_NAME_MAX_CHARS));
}

/** Whether the typed name differs from the saved one (null), ignoring surrounding spaces. */
export function aiNameDirty(draft: string | null, saved: string | null): boolean {
  return draft !== null && draft.trim() !== (saved ?? '');
}

/** Label of an answer scope option. */
export function answerModeLabel(mode: AiAnswerMode): string {
  return copy.ai.answerModeOption[mode];
}

export function AiNameRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const errorId = useId();

  const saved = settings.ai.name;
  // What was typed stays in the field after a failed save, so nothing is lost.
  const value = draft ?? saved ?? '';
  const dirty = aiNameDirty(draft, saved);
  const errorText = tooLong
    ? aiNameErrorText()
    : mutation.isError
      ? saveFailureText(mutation.error)
      : null;

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!dirty || mutation.isPending) return;
    const checked = validateAiName(value);
    if (!checked.ok) {
      setTooLong(true);
      inputRef.current?.focus();
      return;
    }
    mutation.mutate(
      { aiName: checked.value },
      {
        onSuccess: () => {
          setDraft(null);
          showToast('success', commonCopy.toast.saved);
          inputRef.current?.focus();
        },
        onError: () => {
          inputRef.current?.focus();
        },
      },
    );
  };

  return (
    <SettingsRow label={copy.ai.aiName} description={copy.ai.aiNameDesc} wideControl>
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col items-start gap-1 medium:items-end"
      >
        <div className="flex w-full items-center gap-2 medium:w-auto">
          <Input
            ref={inputRef}
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            aria-label={copy.ai.aiName}
            aria-invalid={errorText !== null || undefined}
            aria-describedby={errorText !== null ? errorId : undefined}
            placeholder={copy.ai.aiNamePlaceholder}
            data-testid={testIds.settingsAiName}
            className="min-w-0 flex-1 medium:w-[220px] medium:flex-none"
            value={value}
            onChange={(event) => {
              setDraft(event.target.value);
              setTooLong(false);
              if (mutation.isError) mutation.reset();
            }}
          />
          {dirty ? (
            <SaveButton pending={mutation.isPending} testId={testIds.settingsAiNameSave} />
          ) : null}
        </div>
        <FieldError id={errorId} message={errorText} />
      </form>
    </SettingsRow>
  );
}

export function AiAnswerModeRow({ settings }: { settings: SettingsDto }) {
  const mutation = useUpdateSettings();
  const errorId = useId();
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown: AiAnswerMode =
    mutation.isPending && mutation.variables.aiAnswerMode !== undefined
      ? mutation.variables.aiAnswerMode
      : settings.ai.answerMode;

  const choose = (next: AiAnswerMode) => {
    if (mutation.isPending || next === settings.ai.answerMode) return;
    mutation.mutate(
      { aiAnswerMode: next },
      {
        onSuccess: () => {
          showToast('success', commonCopy.toast.saved);
        },
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const target = nextRadioIndex(event.key, index, AI_ANSWER_MODES.length);
    if (target === null) return;
    event.preventDefault();
    const mode = AI_ANSWER_MODES[target];
    if (mode === undefined) return;
    refs.current[target]?.focus();
    choose(mode);
  };

  return (
    <SettingsRow
      label={copy.ai.answerMode}
      labelId={labelId}
      description={copy.ai.answerModeDesc}
      wideControl
    >
      <div className="flex flex-col items-stretch gap-1 medium:items-end">
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={mutation.isError ? errorId : undefined}
          data-testid={testIds.settingsAnswerMode}
          className="grid w-full gap-2 medium:w-[460px] medium:grid-cols-2"
        >
          {AI_ANSWER_MODES.map((mode, index) => {
            const checked = mode === shown;
            const descId = `${labelId}-${mode}`;
            return (
              <Button
                key={mode}
                ref={(node: HTMLButtonElement | null) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-describedby={descId}
                tabIndex={checked ? 0 : -1}
                data-value={mode}
                className={cn(
                  'h-auto min-h-11 items-start justify-start rounded-xl py-2 text-left whitespace-normal medium:h-auto',
                  checked && 'border-accent-strong bg-selected',
                )}
                onClick={() => {
                  choose(mode);
                }}
                onKeyDown={(event) => {
                  onKeyDown(event, index);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={cn('mt-0.5', checked ? 'visible' : 'invisible')}
                />
                <span className="flex min-w-0 flex-col">
                  <span>{answerModeLabel(mode)}</span>
                  <span id={descId} className="text-sub font-normal text-muted">
                    {copy.ai.answerModeOptionDesc[mode]}
                  </span>
                </span>
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
