'use client';

import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { errorMessage } from '@/common/error-messages';
import { BP_NARROW } from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import { ApiError } from '@/common/common.api';
import { unlock } from './access.api';
import { copy } from './access.constants';
import { validateAccessCode } from './access.logic';
import styles from './welcome.module.css';

/** Code for `data-code` of `access-error` (ui-screens 11) and the text shown for it. */
type AccessErrorView = { code: string; text: string };

function failureView(error: unknown): AccessErrorView {
  const code = error instanceof ApiError ? error.code : 'internal.unexpected';
  return { code, text: errorMessage(code) ?? errorMessage('internal.unexpected') ?? '' };
}

export function AccessForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<AccessErrorView | null>(null);

  const mutation = useMutation({
    mutationFn: unlock,
    onSuccess: () => {
      router.refresh();
    },
    onError: (cause) => {
      setError(failureView(cause));
      // Select the typed code so the next attempt can simply overwrite it.
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  });
  const submitting = mutation.isPending;

  useEffect(() => {
    // Focus the field on a wide screen only: on a phone it would open the keyboard at once.
    if (window.matchMedia(`(min-width: ${String(BP_NARROW)}px)`).matches) inputRef.current?.focus();
  }, []);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const check = validateAccessCode(code);
    if (!check.ok) {
      // `empty` is the client-side code: the key of `access.error.empty` (ui-copy).
      setError({ code: 'empty', text: copy.error.empty });
      inputRef.current?.focus();
      return;
    }
    setError(null);
    mutation.mutate(check.code);
  }

  return (
    <form className={styles.form} data-testid={testIds.accessForm} noValidate onSubmit={onSubmit}>
      <div className={styles.field}>
        <label htmlFor="access-code" className="sr-only">
          {copy.form.label}
        </label>
        <input
          ref={inputRef}
          id="access-code"
          data-testid={testIds.accessCodeInput}
          className={styles.input}
          type={visible ? 'text' : 'password'}
          value={code}
          placeholder={copy.form.placeholder}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={errorId}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
        <button
          type="button"
          data-testid={testIds.accessCodeToggle}
          className={styles.toggle}
          aria-label={visible ? copy.form.hideCode : copy.form.showCode}
          aria-pressed={visible}
          onClick={() => {
            setVisible((value) => !value);
          }}
        >
          {visible ? (
            <EyeOff aria-hidden="true" size={20} strokeWidth={1.75} />
          ) : (
            <Eye aria-hidden="true" size={20} strokeWidth={1.75} />
          )}
        </button>
      </div>
      <div
        id={errorId}
        role="alert"
        data-testid={testIds.accessError}
        data-code={error?.code}
        className={styles.error}
      >
        {error !== null && (
          <>
            <AlertCircle aria-hidden="true" size={16} />
            <span>{error.text}</span>
          </>
        )}
      </div>
      <button
        type="submit"
        data-testid={testIds.accessSubmit}
        className={styles.submit}
        aria-busy={submitting}
        aria-label={submitting ? copy.form.submitting : undefined}
      >
        {submitting ? (
          <Loader2 aria-hidden="true" size={18} className={styles.spinner} />
        ) : (
          copy.form.submit
        )}
      </button>
    </form>
  );
}
