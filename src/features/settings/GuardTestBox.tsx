'use client';

import { CircleAlert, CircleCheck, Info, LoaderCircle, ShieldX } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import type { SettingsDto } from '@/contracts';

import { useTestTopicGuard } from './guard.hooks';
import {
  fillTemplate,
  guardErrorText,
  guardTestDisabledReason,
  validateGuardTestInput,
} from './guard.logic';
import { copy } from './settings.constants';

type TestOutcome =
  | { result: 'allowed'; text: string; costUsd: string }
  | { result: 'blocked'; text: string; costUsd: string }
  | { result: 'error'; text: string; code: string };

type GuardTestBoxProps = { settings: SettingsDto };

/**
 * Tries one message against the saved topics (ui-screens 9.13). The text stays after a test; the
 * result goes away when the text changes. A test costs a call to the model, which the row
 * description and the cost line say.
 */
export function GuardTestBox({ settings }: GuardTestBoxProps) {
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const test = useTestTopicGuard();
  const reasonId = useId();

  const disabledReason = guardTestDisabledReason(settings);
  const disabled = disabledReason !== null;
  const testing = test.isPending;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (disabled || testing) return;
    const check = validateGuardTestInput(text);
    if (!check.ok) {
      setOutcome({ result: 'error', text: guardErrorText(check.code), code: check.code });
      return;
    }
    setOutcome(null);
    test.mutate(text.trim(), {
      onSuccess: (data) => {
        if (data.allowed) {
          setOutcome({
            result: 'allowed',
            text:
              data.matchedTopic === null
                ? copy.guard.testAllowedNoTopic
                : fillTemplate(copy.guard.testAllowed, { topic: data.matchedTopic }),
            costUsd: data.costUsd,
          });
        } else {
          setOutcome({ result: 'blocked', text: copy.guard.testBlocked, costUsd: data.costUsd });
        }
      },
      onError: (error) => {
        const code = errorCodeOf(error);
        setOutcome({
          result: 'error',
          code,
          text:
            errorMessage(code, { variant: 'settings' }) ??
            errorMessage('internal.unexpected') ??
            commonCopy.error.section,
        });
      },
    });
  };

  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOutcome(null);
          }}
          disabled={disabled}
          placeholder={copy.guard.testPlaceholder}
          aria-label={copy.guard.test}
          aria-describedby={disabled ? reasonId : undefined}
          data-testid={testIds.guardTestInput}
          className="min-w-0 flex-1 basis-60 medium:h-11"
        />
        <Button
          type="submit"
          disabled={disabled}
          aria-disabled={testing || undefined}
          aria-label={testing ? copy.guard.testing : undefined}
          data-testid={testIds.guardTestSubmit}
          className="relative"
        >
          <span className={testing ? 'invisible' : undefined}>{copy.guard.testSubmit}</span>
          {testing ? (
            <LoaderCircle aria-hidden="true" className="absolute size-4 animate-spin" />
          ) : null}
        </Button>
      </div>

      {disabledReason !== null ? (
        <p
          id={reasonId}
          data-testid={testIds.guardTestDisabledReason}
          className="mt-2 flex items-center gap-1.5 text-sub text-muted"
        >
          <Info aria-hidden="true" className="size-3.5 shrink-0" />
          {disabledReason === 'killed' ? copy.guard.testDisabledKilled : copy.guard.testNeedsTopics}
        </p>
      ) : null}

      <div role="status">
        {outcome !== null ? (
          <p
            data-testid={testIds.guardTestResult}
            data-result={outcome.result}
            data-code={outcome.result === 'error' ? outcome.code : undefined}
            className="mt-2 flex items-start gap-1.5 text-body"
          >
            {outcome.result === 'allowed' ? (
              <CircleCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
            ) : outcome.result === 'blocked' ? (
              <ShieldX aria-hidden="true" className="mt-1 size-4 shrink-0 text-danger" />
            ) : (
              <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-danger" />
            )}
            <span className="min-w-0 break-words">{outcome.text}</span>
          </p>
        ) : null}
        {outcome !== null && outcome.result !== 'error' ? (
          <p data-testid={testIds.guardTestCost} className="mt-1 text-meta text-muted tabular-nums">
            {fillTemplate(copy.guard.testCost, { usd: outcome.costUsd })}
          </p>
        ) : null}
      </div>
    </form>
  );
}
