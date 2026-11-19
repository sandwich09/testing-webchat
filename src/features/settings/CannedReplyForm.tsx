'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Textarea } from '@/common/ui/textarea';
import {
  CANNED_REPLY_MAX_COUNT,
  CANNED_TEXT_MAX_CHARS,
  CANNED_TITLE_MAX_CHARS,
  type CannedReplyDto,
} from '@/contracts';
import { copy } from '@/features/settings/settings.constants';
import { useCreateCannedReply, useUpdateCannedReply } from '@/features/settings/settings.hooks';
import { validateCannedReply } from '@/features/settings/settings.logic';

type CannedReplyFormProps = {
  /** The reply being edited; omitted when adding a new one. */
  reply?: CannedReplyDto;
  /** Cancel, Escape, or a successful save. */
  onClose: () => void;
};

type FieldErrors = { title?: string; text?: string };

function fieldError(field: 'title' | 'text', code: 'required' | 'too_long'): string {
  if (field === 'title') {
    return code === 'required'
      ? copy.canned.errors.titleRequired
      : copy.canned.errors.titleTooLong.replace('{max}', String(CANNED_TITLE_MAX_CHARS));
  }
  return code === 'required'
    ? copy.canned.errors.textRequired
    : copy.canned.errors.textTooLong.replace('{max}', String(CANNED_TEXT_MAX_CHARS));
}

/**
 * Add or edit form of one canned reply (ui-screens 9.8). What was typed stays when saving fails,
 * and the error is shown under the form.
 */
export function CannedReplyForm({ reply, onClose }: CannedReplyFormProps) {
  const create = useCreateCannedReply();
  const update = useUpdateCannedReply();
  const [title, setTitle] = useState(reply?.title ?? '');
  const [text, setText] = useState(reply?.text ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<{ code: string; message: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;
  const titleErrorId = `${ids}-title-error`;
  const textErrorId = `${ids}-text-error`;
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending) return;
    setServerError(null);
    const check = validateCannedReply({ title, text });
    if (!check.ok) {
      setErrors({ [check.field]: fieldError(check.field, check.code) });
      (check.field === 'title' ? titleRef : textRef).current?.focus();
      return;
    }
    setErrors({});
    const body = { title: title.trim(), text: text.trim() };
    const options = {
      onSuccess: onClose,
      onError: (error: unknown) => {
        const code = errorCodeOf(error);
        const message =
          errorMessage(code, { variant: 'form', max: CANNED_REPLY_MAX_COUNT }) ??
          errorMessage('internal.unexpected', { variant: 'form' }) ??
          '';
        setServerError({ code, message });
      },
    };
    if (reply) update.mutate({ id: reply.id, ...body }, options);
    else create.mutate(body, options);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={onKeyDown}
      data-testid={testIds.cannedForm}
      className="flex flex-col gap-4 border-b border-line py-3.5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-body font-bold">
          {copy.canned.fieldTitle}
        </label>
        <Input
          ref={titleRef}
          id={titleId}
          value={title}
          placeholder={copy.canned.fieldTitlePlaceholder}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? titleErrorId : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          data-testid={testIds.cannedFormTitle}
          className="h-11 rounded-[12px]"
        />
        {errors.title ? (
          <p id={titleErrorId} role="alert" className="text-sub text-danger">
            {errors.title}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className="text-body font-bold">
          {copy.canned.fieldText}
        </label>
        <Textarea
          ref={textRef}
          id={textId}
          value={text}
          aria-invalid={errors.text ? true : undefined}
          aria-describedby={errors.text ? textErrorId : undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
          data-testid={testIds.cannedFormText}
          className="max-h-[200px] min-h-[88px] overflow-y-auto"
        />
        {errors.text ? (
          <p id={textErrorId} role="alert" className="text-sub text-danger">
            {errors.text}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <p role="alert" data-code={serverError.code} className="text-sub text-danger">
          {serverError.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={onClose}
          data-testid={testIds.cannedFormCancel}
        >
          {commonCopy.action.cancel}
        </Button>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          data-testid={testIds.cannedFormSave}
        >
          {commonCopy.action.save}
        </Button>
      </div>
    </form>
  );
}
