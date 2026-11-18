'use client';

// LINE Official Account section of the settings page (ui-screens 9.4). The channel secret and the
// access token are only ever typed here: no value from the server is put into these fields, and
// both are emptied after a successful save.
import { Loader2 } from 'lucide-react';
import { useId, useRef, useState, type SyntheticEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn, formatDateTime } from '@/common/common.logic';
import { useSettings } from '@/common/common.hooks';
import { errorMessage } from '@/common/error-messages';
import { ErrorState } from '@/common/ErrorState';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Skeleton } from '@/common/ui/skeleton';
import type { SettingsDto } from '@/contracts';

import { copy } from './settings.constants';
import { useSaveLineCredentials, useTestLineConnection } from './settings.hooks';
import { validateLineCredentials } from './settings.logic';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';

/** The runbook on GitHub that the setup steps link to (ui-screens 9.4). */
export const LINE_SETUP_GUIDE_URL =
  'https://github.com/sandwich09/testing-webchat/blob/main/docs/runbooks/line-oa-setup.md';

type LineStatus = SettingsDto['line']['status'];

/** Result line under the buttons: what the last save or test said. */
export type LineResult =
  { kind: 'ok'; botName: string } | { kind: 'error'; code: string; text: string };

// ---------------------------------------------------------------------------
// Pure helpers (unit tested in LineSettingsSection.spec.ts)
// ---------------------------------------------------------------------------

/** Text and tone of the three documented states of `line.status`. */
export function lineStatusView(status: LineStatus): {
  text: string;
  tone: 'success' | 'danger' | 'muted';
} {
  switch (status) {
    case 'connected':
      return { text: copy.line.statusConnected, tone: 'success' };
    case 'error':
      return { text: copy.line.statusError, tone: 'danger' };
    case 'not_configured':
      return { text: copy.line.statusNotConfigured, tone: 'muted' };
  }
}

/** "ชื่อ OA · Basic ID @abc"; empty parts are left out and nothing gives `null`. */
export function lineAccountText(
  line: Pick<SettingsDto['line'], 'botName' | 'basicId'>,
): string | null {
  const parts = [
    line.botName !== null && line.botName !== '' ? line.botName : null,
    line.basicId !== null && line.basicId !== ''
      ? copy.line.basicId.replace('{basicId}', line.basicId)
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

/** "รับข้อความล่าสุด 18 พ.ย. 14:32" or the never text. */
export function lastWebhookText(iso: string | null, now: Date): string {
  return iso === null
    ? copy.line.lastWebhookNever
    : copy.line.lastWebhook.replace('{dateTime}', formatDateTime(iso, now));
}

/** "เชื่อมต่อได้ OA ชื่อ …" */
export function testOkText(botName: string): string {
  return copy.line.testOk.replace('{name}', botName);
}

/** Result line of a failed call: the catalog text of its code, shown where the LINE section talks. */
export function lineFailureResult(error: unknown): LineResult {
  const code = errorCodeOf(error);
  const text =
    errorMessage(code, { variant: 'settings' }) ??
    errorMessage('internal.unexpected', { variant: 'form' }) ??
    commonCopy.error.network;
  return { kind: 'error', code, text };
}

/** Message under a credential field for a result code of `validateLineCredentials`. */
export function credentialErrorText(field: 'channelSecret' | 'channelAccessToken'): string {
  return field === 'channelSecret'
    ? copy.line.error.channelSecretRequired
    : copy.line.error.accessTokenRequired;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const toneDot = { success: 'bg-success', danger: 'bg-danger', muted: 'bg-muted' } as const;
const toneText = { success: 'text-success', danger: 'text-danger', muted: 'text-muted' } as const;

function StatusRow({ line, now }: { line: SettingsDto['line']; now: Date }) {
  const view = lineStatusView(line.status);
  const account = lineAccountText(line);
  return (
    <div className="flex min-h-16 items-center gap-6 border-b border-line py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-body font-bold">{copy.line.status}</p>
        {account !== null ? (
          <p data-testid={testIds.lineBotName} className="text-sub text-muted">
            {account}
          </p>
        ) : null}
        {line.status !== 'not_configured' ? (
          <p className="text-sub text-muted">{lastWebhookText(line.lastWebhookAt, now)}</p>
        ) : null}
      </div>
      <p
        data-testid={testIds.lineStatus}
        data-status={line.status}
        className={cn('flex shrink-0 items-center gap-2 text-sub font-bold', toneText[view.tone])}
      >
        <span aria-hidden="true" className={cn('size-2 rounded-full', toneDot[view.tone])} />
        {view.text}
      </p>
    </div>
  );
}

function WebhookRow({ url }: { url: string }) {
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('success', copy.line.copiedToast);
    } catch {
      showToast('error', copy.line.copyFailed);
    }
  };
  return (
    <SettingsRow
      label={copy.line.webhookUrl}
      description={copy.line.webhookUrlDesc}
      wideControl
      className="medium:flex-col medium:items-stretch"
    >
      <div className="flex items-center gap-2">
        <Input
          readOnly
          aria-label={copy.line.webhookUrl}
          value={url}
          data-testid={testIds.lineWebhookUrl}
          className="font-mono text-[14px] medium:text-[14px]"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <Button
          type="button"
          data-testid={testIds.lineWebhookCopy}
          onClick={() => {
            void copyUrl();
          }}
        >
          {copy.line.copy}
        </Button>
      </div>
    </SettingsRow>
  );
}

function SetupSteps() {
  return (
    <div data-testid={testIds.lineSetupSteps} className="border-b border-line py-3.5">
      <p className="text-body font-bold">{copy.line.setupTitle}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-6 text-sub text-muted">
        <li>{copy.line.setupStep1}</li>
        <li>{copy.line.setupStep2}</li>
        <li>{copy.line.setupStep3}</li>
      </ol>
      <a
        href={LINE_SETUP_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center text-sub font-bold underline underline-offset-4 hover:no-underline medium:min-h-0"
      >
        {copy.line.setupGuide}
      </a>
    </div>
  );
}

type CredentialField = 'channelSecret' | 'channelAccessToken';

function CredentialRow({
  label,
  testId,
  value,
  placeholder,
  errorText,
  errorId,
  onChange,
  inputRef,
}: {
  label: string;
  testId: string;
  value: string;
  placeholder: string;
  errorText: string | null;
  errorId: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <SettingsRow
      label={label}
      description={copy.line.credentialsDesc}
      wideControl
      className="medium:flex-col medium:items-stretch"
    >
      <div className="flex flex-col gap-1">
        <Input
          ref={inputRef}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          aria-label={label}
          aria-invalid={errorText !== null || undefined}
          aria-describedby={errorText !== null ? errorId : undefined}
          placeholder={placeholder}
          data-testid={testId}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {errorText !== null ? (
          <p id={errorId} role="alert" className="text-sub text-danger">
            {errorText}
          </p>
        ) : null}
      </div>
    </SettingsRow>
  );
}

function BusyButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button aria-busy={pending || undefined} className="relative" {...props}>
      <span className={pending ? 'invisible' : undefined}>{children}</span>
      {pending ? (
        <Loader2 aria-hidden="true" className="absolute size-[18px] animate-spin" />
      ) : null}
    </Button>
  );
}

function CredentialsForm({ line }: { line: SettingsDto['line'] }) {
  const save = useSaveLineCredentials();
  const test = useTestLineConnection();
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [invalid, setInvalid] = useState<CredentialField | null>(null);
  const [result, setResult] = useState<LineResult | null>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const secretErrorId = useId();
  const tokenErrorId = useId();
  const reasonId = useId();

  const placeholder = line.configured
    ? copy.line.secretPlaceholderSet
    : copy.line.secretPlaceholderEmpty;
  const busy = save.isPending || test.isPending;
  const canTest = line.configured;

  const onSave = (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) return;
    const check = validateLineCredentials({ channelSecret: secret, channelAccessToken: token });
    if (!check.ok) {
      setInvalid(check.field);
      (check.field === 'channelSecret' ? secretRef : tokenRef).current?.focus();
      return;
    }
    setInvalid(null);
    setResult(null);
    save.mutate(
      { channelSecret: secret.trim(), channelAccessToken: token.trim() },
      {
        onSuccess: () => {
          // Nothing the admin typed stays in the page once it is saved.
          setSecret('');
          setToken('');
          showToast('success', copy.line.savedToast);
        },
        // What was typed stays so it can be fixed and saved again.
        onError: (error) => {
          setResult(lineFailureResult(error));
        },
      },
    );
  };

  const onTest = () => {
    if (busy || !canTest) return;
    setResult(null);
    test.mutate(undefined, {
      onSuccess: (info) => {
        setResult({ kind: 'ok', botName: info.botName });
      },
      onError: (error) => {
        setResult(lineFailureResult(error));
      },
    });
  };

  return (
    <form noValidate autoComplete="off" onSubmit={onSave}>
      <CredentialRow
        label={copy.line.channelSecret}
        testId={testIds.lineChannelSecret}
        value={secret}
        placeholder={placeholder}
        errorText={invalid === 'channelSecret' ? credentialErrorText('channelSecret') : null}
        errorId={secretErrorId}
        inputRef={secretRef}
        onChange={(next) => {
          setSecret(next);
          setInvalid(null);
        }}
      />
      <CredentialRow
        label={copy.line.accessToken}
        testId={testIds.lineAccessToken}
        value={token}
        placeholder={placeholder}
        errorText={
          invalid === 'channelAccessToken' ? credentialErrorText('channelAccessToken') : null
        }
        errorId={tokenErrorId}
        inputRef={tokenRef}
        onChange={(next) => {
          setToken(next);
          setInvalid(null);
        }}
      />
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 py-3.5">
        {!canTest ? (
          <p id={reasonId} className="min-w-0 flex-1 text-sub text-muted">
            {copy.line.testNeedsCredentials}
          </p>
        ) : null}
        <BusyButton
          type="button"
          pending={test.isPending}
          aria-disabled={!canTest || busy || undefined}
          aria-describedby={!canTest ? reasonId : undefined}
          data-testid={testIds.lineTest}
          onClick={onTest}
        >
          {copy.line.test}
        </BusyButton>
        <BusyButton
          type="submit"
          pending={save.isPending}
          aria-disabled={busy || undefined}
          data-testid={testIds.lineSave}
        >
          {copy.line.save}
        </BusyButton>
      </div>
      <p
        role="status"
        data-testid={testIds.lineResult}
        data-result={result?.kind}
        data-code={result?.kind === 'error' ? result.code : undefined}
        className={cn(
          'text-sub',
          result?.kind === 'ok' && 'text-success',
          result?.kind === 'error' && 'text-danger',
        )}
      >
        {result === null ? null : result.kind === 'ok' ? testOkText(result.botName) : result.text}
      </p>
    </form>
  );
}

function LineSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        {commonCopy.loading}
      </span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex min-h-16 items-center gap-6 border-b border-line py-3.5 last:border-b-0"
        >
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

function LineBody({ line }: { line: SettingsDto['line'] }) {
  // Only the year of "now" matters (the Buddhist-era year shows for an older date).
  const [now] = useState(() => new Date());
  return (
    <div>
      <StatusRow line={line} now={now} />
      <WebhookRow url={line.webhookUrl} />
      {line.status === 'not_configured' ? <SetupSteps /> : null}
      <CredentialsForm line={line} />
    </div>
  );
}

/** LINE Official Account settings (ui-screens 9.4). */
export function LineSettingsSection() {
  const query = useSettings();
  const settings = query.data;
  return (
    <SettingsSection
      title={copy.line.title}
      testId={testIds.settingsSectionLine}
      onRetry={() => {
        void query.refetch();
      }}
    >
      {settings !== undefined ? (
        <LineBody line={settings.line} />
      ) : query.isError ? (
        <ErrorState
          message={commonCopy.error.section}
          code={errorCodeOf(query.error)}
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <LineSkeleton />
      )}
    </SettingsSection>
  );
}
