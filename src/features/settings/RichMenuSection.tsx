'use client';

// Rich menu and welcome card cards of the LINE tab (ui-screens 9.4.1): publish or remove the LINE
// rich menu, the text of "วิธีทดสอบ", and the welcome card sent on a follow. Every control
// saves through its own mutation, so pending, success and error belong to that control only.
import { Loader2 } from 'lucide-react';
import { useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { useSettings } from '@/common/common.hooks';
import { cn, formatDateTime } from '@/common/common.logic';
import { errorMessage } from '@/common/error-messages';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
import { Skeleton } from '@/common/ui/skeleton';
import { Switch } from '@/common/ui/switch';
import { Textarea } from '@/common/ui/textarea';
import {
  HOW_TO_TEXT_MAX_CHARS,
  RICH_MENU_ACTIONS,
  RICH_MENU_LABELS,
  WELCOME_NOTE,
  WELCOME_TEXT_MAX_CHARS,
  WELCOME_TITLE_LINE,
  type SettingsDto,
} from '@/contracts';

import { copy } from './settings.constants';
import { useRichMenuAction, useUpdateSettings } from './settings.hooks';
import {
  defaultBackedDirty,
  defaultBackedPatch,
  defaultBackedValue,
  textCounter,
} from './settings.logic';
import { FieldError, SaveButton, saveFailureText } from './SettingsFormParts';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

/** Text of the stored rich menu error: the catalog text of the code under the settings wording. */
export function richMenuErrorText(
  code: NonNullable<SettingsDto['richMenu']['lastError']>['code'],
): string {
  const text =
    errorMessage(code, { variant: 'settings' }) ??
    errorMessage('internal.unexpected', { variant: 'form' }) ??
    commonCopy.error.network;
  return copy.richMenu.lastError.replace('{error}', text);
}

function StatusRow({
  richMenu,
  lineConfigured,
}: {
  richMenu: SettingsDto['richMenu'];
  lineConfigured: boolean;
}) {
  // Only the year of "now" matters (the Buddhist-era year shows for an older date).
  const [now] = useState(() => new Date());
  const mutation = useRichMenuAction();
  const pending = mutation.isPending ? mutation.variables : null;
  const run = (action: 'publish' | 'remove') => {
    if (mutation.isPending) return;
    mutation.mutate(action, {
      onSuccess: () => {
        showToast(
          'success',
          action === 'publish' ? copy.richMenu.publishedToast : copy.richMenu.removedToast,
        );
      },
      onError: (error) => {
        showToast('error', saveFailureText(error));
      },
    });
  };
  const description = !lineConfigured
    ? copy.richMenu.needsLine
    : richMenu.published && richMenu.publishedAt !== null
      ? copy.richMenu.publishedAt.replace('{dateTime}', formatDateTime(richMenu.publishedAt, now))
      : copy.richMenu.notPublishedDesc;
  return (
    <SettingsRow label={copy.richMenu.status} description={description} layout="column">
      <div className="flex flex-col items-start gap-2 medium:items-end">
        <p
          data-testid={testIds.richMenuStatus}
          data-status={richMenu.published ? 'published' : 'not_published'}
          className={cn(
            'flex items-center gap-2 text-sub font-bold',
            richMenu.published ? 'text-success' : 'text-muted',
          )}
        >
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', richMenu.published ? 'bg-success' : 'bg-muted')}
          />
          {richMenu.published ? copy.richMenu.statusPublished : copy.richMenu.statusNotPublished}
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={richMenu.published ? copy.richMenu.republish : copy.richMenu.publish}
            pending={pending === 'publish'}
            disabled={!lineConfigured}
            testId={testIds.richMenuPublish}
            onClick={() => {
              run('publish');
            }}
          />
          {richMenu.published ? (
            <ActionButton
              label={copy.richMenu.remove}
              pending={pending === 'remove'}
              disabled={!lineConfigured}
              testId={testIds.richMenuRemove}
              onClick={() => {
                run('remove');
              }}
            />
          ) : null}
        </div>
        {richMenu.lastError !== null ? (
          <p data-testid={testIds.richMenuError} role="status" className="text-sub text-danger">
            {richMenuErrorText(richMenu.lastError.code)}
          </p>
        ) : null}
      </div>
    </SettingsRow>
  );
}

function ActionButton({
  label,
  pending,
  disabled,
  testId,
  onClick,
}: {
  label: string;
  pending: boolean;
  disabled: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      disabled={disabled}
      aria-busy={pending || undefined}
      data-testid={testId}
      className="relative"
      onClick={() => {
        if (!pending) onClick();
      }}
    >
      <span className={pending ? 'invisible' : undefined}>{label}</span>
      {pending ? (
        <Loader2 aria-hidden="true" className="absolute size-[18px] animate-spin" />
      ) : null}
    </Button>
  );
}

type DefaultBackedField = 'howToText' | 'welcomeText';

/** A multi-line text with a counter, a save button and "ใช้ข้อความเริ่มต้น". */
function DefaultBackedTextRow({
  field,
  label,
  description,
  saved,
  defaultText,
  max,
  ids,
}: {
  field: DefaultBackedField;
  label: string;
  description: string;
  saved: string;
  defaultText: string;
  max: number;
  ids: { field: string; save: string; reset: string };
}) {
  const mutation = useUpdateSettings();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const counterId = useId();
  const errorId = useId();

  const value = defaultBackedValue(draft, saved, defaultText);
  const dirty = defaultBackedDirty(draft, saved, defaultText);
  const tooLong = value.trim().length > max;
  const errorText = tooLong
    ? copy.richMenu.tooLong.replace('{max}', String(max))
    : mutation.isError
      ? saveFailureText(mutation.error)
      : null;

  const save = (next: string, toast: string) => {
    mutation.mutate(
      { [field]: next },
      {
        onSuccess: () => {
          setDraft(null);
          showToast('success', toast);
          areaRef.current?.focus();
        },
        // What was typed stays in the field (draft) so nothing is lost.
        onError: () => {
          areaRef.current?.focus();
        },
      },
    );
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!dirty || mutation.isPending) return;
    if (tooLong) {
      areaRef.current?.focus();
      return;
    }
    save(defaultBackedPatch(value, defaultText), commonCopy.toast.saved);
  };

  return (
    <SettingsRow label={label} description={description} layout="stacked">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2">
        <Textarea
          ref={areaRef}
          rows={field === 'howToText' ? 7 : 3}
          aria-label={label}
          aria-invalid={errorText !== null || undefined}
          aria-describedby={errorText !== null ? `${errorId} ${counterId}` : counterId}
          autoComplete="off"
          data-testid={ids.field}
          className="max-h-[19rem] min-h-[5.5rem] resize-y"
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
            {textCounter(value.trim().length, max)}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {saved !== '' || dirty ? (
            <Button
              type="button"
              variant="secondary"
              data-testid={ids.reset}
              disabled={mutation.isPending}
              onClick={() => {
                if (saved === '') {
                  setDraft(null);
                  return;
                }
                save('', copy.richMenu.resetToast);
              }}
            >
              {copy.richMenu.reset}
            </Button>
          ) : null}
          <SaveButton pending={mutation.isPending} dirty={dirty} testId={ids.save} />
        </div>
      </form>
    </SettingsRow>
  );
}

function WelcomeSwitchRow({ enabled }: { enabled: boolean }) {
  const mutation = useUpdateSettings();
  const shown =
    mutation.isPending && mutation.variables.welcomeEnabled !== undefined
      ? mutation.variables.welcomeEnabled
      : enabled;
  return (
    <SettingsRow label={copy.richMenu.welcomeSwitch} description={copy.richMenu.welcomeSwitchDesc}>
      <Switch
        aria-label={copy.richMenu.welcomeSwitch}
        aria-busy={mutation.isPending || undefined}
        data-testid={testIds.settingsWelcomeSwitch}
        checked={shown}
        onCheckedChange={(next) => {
          if (mutation.isPending) return;
          mutation.mutate(
            { welcomeEnabled: next },
            {
              onSuccess: () => {
                showToast(
                  'success',
                  next ? copy.richMenu.welcomeOnToast : copy.richMenu.welcomeOffToast,
                );
              },
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

/** A read-only picture of the welcome card with the saved text. */
function WelcomePreview({ welcome }: { welcome: SettingsDto['welcome'] }) {
  const body = welcome.text === '' ? welcome.defaultText : welcome.text;
  return (
    <SettingsRow
      label={copy.richMenu.preview}
      description={copy.richMenu.previewDesc}
      layout="stacked"
    >
      <figure
        data-testid={testIds.welcomePreview}
        aria-label={copy.richMenu.preview}
        className="w-full max-w-[300px] overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
      >
        {/* Solid accent, not the brand gradient: frontend.md keeps the gradient to four places. */}
        <div className="flex items-center gap-3 bg-accent-strong p-4 text-white">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-body font-bold"
          >
            T
          </span>
          <div className="min-w-0">
            <p className="text-meta">{WELCOME_TITLE_LINE}</p>
            <p className="truncate text-body font-bold">{welcome.accountName}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-sub whitespace-pre-wrap">{body}</p>
          <p className="text-meta text-muted">{WELCOME_NOTE}</p>
          <div className="mt-1 flex flex-col gap-2" aria-hidden="true">
            {RICH_MENU_ACTIONS.map((action, i) => (
              <span
                key={action}
                className={cn(
                  'rounded-md py-2 text-center text-sub font-bold',
                  i === 0 && 'bg-accent-strong text-white',
                  i === 1 && 'border border-line bg-surface text-fg',
                  i === 2 && 'text-accent-strong',
                )}
              >
                {RICH_MENU_LABELS[action].title}
              </span>
            ))}
          </div>
        </div>
      </figure>
    </SettingsRow>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {commonCopy.loading}
      </span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex min-h-16 items-center gap-6 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      ))}
    </div>
  );
}

/** A card of the LINE tab that shows the settings: its rows, else the error or the skeleton. */
function SettingsCard({
  title,
  testId,
  rows,
  children,
}: {
  title: string;
  testId: string;
  rows: number;
  children: (settings: SettingsDto) => ReactNode;
}) {
  const query = useSettings();
  const settings = query.data;
  const retry = () => {
    void query.refetch();
  };
  return (
    <SettingsSection title={title} testId={testId} onRetry={retry}>
      {settings !== undefined ? (
        children(settings)
      ) : query.isError ? (
        <ErrorState
          message={commonCopy.error.section}
          code={errorCodeOf(query.error)}
          onRetry={retry}
        />
      ) : (
        <CardSkeleton rows={rows} />
      )}
    </SettingsSection>
  );
}

/** Card "Rich menu" of the LINE tab (ui-screens 9.4.1): publish or remove, and the how-to text. */
export function RichMenuSection() {
  return (
    <SettingsCard title={copy.richMenu.title} testId={testIds.settingsSectionRichMenu} rows={2}>
      {(settings) => (
        <>
          <StatusRow richMenu={settings.richMenu} lineConfigured={settings.line.configured} />
          <DefaultBackedTextRow
            field="howToText"
            label={copy.richMenu.howTo}
            description={copy.richMenu.howToDesc}
            saved={settings.richMenu.howToText}
            defaultText={settings.richMenu.howToDefault}
            max={HOW_TO_TEXT_MAX_CHARS}
            ids={{
              field: testIds.settingsHowTo,
              save: testIds.settingsHowToSave,
              reset: testIds.settingsHowToReset,
            }}
          />
        </>
      )}
    </SettingsCard>
  );
}

/** Card "ข้อความต้อนรับ" of the LINE tab (ui-screens 9.4.1): switch, text and preview of the card. */
export function WelcomeSection() {
  return (
    <SettingsCard
      title={copy.richMenu.welcomeTitle}
      testId={testIds.settingsSectionWelcome}
      rows={3}
    >
      {(settings) => (
        <>
          <WelcomeSwitchRow enabled={settings.welcome.enabled} />
          <DefaultBackedTextRow
            field="welcomeText"
            label={copy.richMenu.welcomeText}
            description={copy.richMenu.welcomeTextDesc}
            saved={settings.welcome.text}
            defaultText={settings.welcome.defaultText}
            max={WELCOME_TEXT_MAX_CHARS}
            ids={{
              field: testIds.settingsWelcomeText,
              save: testIds.settingsWelcomeTextSave,
              reset: testIds.settingsWelcomeTextReset,
            }}
          />
          <WelcomePreview welcome={settings.welcome} />
        </>
      )}
    </SettingsCard>
  );
}
