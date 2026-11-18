'use client';

// The reply box of a chat (ui-screens 5.7 to 5.10): text, one attachment, canned replies and the
// typing ping. Sending goes through the optimistic `useSendMessage`; the composer clears as soon
// as the message is handed off, and a failure shows on the bubble with its text kept there.
import { ImagePlus, Info, MessageSquareText } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type JSX,
  type KeyboardEvent,
} from 'react';

import { BP_NARROW } from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import { Button } from '@/common/ui/button';

import { AttachmentTray } from './AttachmentTray';
import { CannedReplyPicker } from './CannedReplyPicker';
import {
  isAttachmentPending,
  rememberSentPreview,
  trayView,
  useAttachment,
  useReleaseSentPreviews,
} from './inbox.attachment';
import { copy } from './inbox.constants';
import { useDraft, useSendMessage } from './inbox.hooks';
import { canSend, insertAtCaret, isSubmitKey } from './inbox.logic';
import { useTypingPing } from './inbox.typing';

/** MOV stays pickable so the admin gets the "use MP4" message instead of a hidden file (5.10). */
const ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,image/webp,video/mp4,video/quicktime';

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-selected hover:text-fg disabled:pointer-events-none disabled:opacity-50 medium:size-9';

export type ComposerProps = {
  contactId: string;
  /** The chat cannot be answered (`composerDisabledReason` is not null). */
  disabled: boolean;
  /** Text shown instead of the toolbar while disabled. */
  disabledReason: string | null;
};

export function Composer({ contactId, disabled, disabledReason }: ComposerProps): JSX.Element {
  const [draft, setDraft] = useDraft(contactId);
  const { send } = useSendMessage(contactId);
  const { attachment, pick, cancel, handOff } = useAttachment(contactId);
  const ping = useTypingPing(contactId, !disabled);
  useReleaseSentPreviews();

  // The picker belongs to one chat: switching chats closes it.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const pickerOpen = pickerFor === contactId && !disabled;

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cannedRef = useRef<HTMLButtonElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const hintId = useId();
  const reasonId = useId();

  const waiting = isAttachmentPending(attachment);
  const sendable = !disabled && canSend(draft, attachment, null);
  const tray = trayView(attachment);

  // Open a chat on a screen of 720px or more: focus the text box. A narrow screen does not, so the
  // keyboard does not pop up (ui-screens 5.11).
  useEffect(() => {
    if (disabled) return;
    if (window.matchMedia(`(min-width: ${String(BP_NARROW)}px)`).matches) {
      inputRef.current?.focus();
    }
  }, [contactId, disabled]);

  // Grow with the text up to six lines (`max-h-[6lh]`), then scroll inside.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = 'auto';
    input.style.height = `${String(input.scrollHeight)}px`;
    if (pendingCaret.current !== null) {
      input.focus();
      input.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [draft]);

  const submit = useCallback(() => {
    if (!sendable) return;
    if (attachment.status === 'ready') {
      const media = handOff();
      if (media !== null) rememberSentPreview(send(media), media.localPreviewUrl);
    }
    if (draft.trim() !== '') {
      send({ kind: 'text', text: draft });
      setDraft('');
    }
    inputRef.current?.focus();
  }, [sendable, attachment.status, handOff, send, draft, setDraft]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent;
    const submitKey = isSubmitKey({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: native.isComposing,
      // 229: the IME is still composing in browsers that do not set isComposing on this event.
      // Read through a plain shape because `keyCode` is deprecated in the DOM types.
      keyCode: (native as { keyCode?: number }).keyCode ?? 0,
    });
    if (!submitKey) return;
    event.preventDefault();
    submit();
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = event.clipboardData.files[0];
    if (file === undefined || disabled) return;
    event.preventDefault();
    pick(file);
  };

  const closePicker = useCallback(() => {
    setPickerFor(null);
  }, []);

  const insertCanned = useCallback(
    (text: string) => {
      const input = inputRef.current;
      const selection =
        input === null
          ? { start: draft.length, end: draft.length }
          : { start: input.selectionStart, end: input.selectionEnd };
      const next = insertAtCaret(draft, selection, text);
      pendingCaret.current = next.caret;
      setPickerFor(null);
      setDraft(next.value);
      if (next.value === draft) {
        // No change, so the layout effect will not run: focus here.
        input?.focus();
        input?.setSelectionRange(next.caret, next.caret);
        pendingCaret.current = null;
      }
    },
    [draft, setDraft],
  );

  return (
    <div
      data-testid={testIds.composer}
      className="relative shrink-0 border-t border-line bg-surface px-4 pt-2.5 pb-3"
    >
      {tray !== null && <AttachmentTray view={tray} onCancel={cancel} />}

      <textarea
        ref={inputRef}
        data-testid={testIds.composerInput}
        rows={1}
        value={draft}
        disabled={disabled}
        placeholder={copy.composer.placeholder}
        aria-label={copy.composer.placeholder}
        aria-describedby={disabled && disabledReason !== null ? reasonId : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          ping(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="block max-h-[6lh] w-full resize-none overflow-y-auto bg-transparent py-1 text-[16px] leading-[1.55] text-fg placeholder:text-muted focus-visible:outline-none disabled:cursor-not-allowed medium:text-body"
      />

      {disabled && disabledReason !== null ? (
        <p
          id={reasonId}
          data-testid={testIds.composerDisabledReason}
          className="flex min-h-11 items-center gap-2 text-sub text-muted medium:min-h-9"
        >
          <Info aria-hidden="true" className="size-4 shrink-0" />
          <span>{disabledReason}</span>
        </p>
      ) : (
        <div className="flex h-11 items-center gap-1 medium:h-9">
          <button
            type="button"
            data-testid={testIds.composerAttach}
            aria-label={copy.composer.attach}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className={iconButton}
          >
            <ImagePlus aria-hidden="true" className="size-5" />
          </button>
          <button
            ref={cannedRef}
            type="button"
            data-testid={testIds.composerCanned}
            aria-label={copy.composer.canned}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            disabled={disabled}
            onClick={() => {
              setPickerFor(pickerOpen ? null : contactId);
            }}
            className={iconButton}
          >
            <MessageSquareText aria-hidden="true" className="size-5" />
          </button>
          <span
            id={hintId}
            data-testid={testIds.composerHint}
            className={
              waiting
                ? 'ml-2 min-w-0 truncate py-0.5 text-meta text-muted'
                : 'ml-2 hidden min-w-0 truncate py-0.5 text-meta text-muted medium:inline'
            }
          >
            {waiting ? copy.composer.waitUpload : copy.composer.hint}
          </span>
          <Button
            type="button"
            variant="default"
            data-testid={testIds.composerSend}
            disabled={!sendable}
            aria-describedby={waiting ? hintId : undefined}
            onClick={submit}
            className="ml-auto h-11 px-[18px] text-[15px] medium:h-9"
          >
            {copy.composer.send}
          </Button>
        </div>
      )}

      <CannedReplyPicker
        open={pickerOpen}
        onClose={closePicker}
        onPick={insertCanned}
        anchorRef={cannedRef}
      />

      <input
        ref={fileRef}
        type="file"
        hidden
        tabIndex={-1}
        accept={ACCEPT}
        data-testid={testIds.composerFileInput}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // the same file can be picked again
          if (file !== undefined) pick(file);
        }}
      />
    </div>
  );
}
