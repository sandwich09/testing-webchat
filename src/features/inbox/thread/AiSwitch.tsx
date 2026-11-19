'use client';

import { useId } from 'react';

import { errorCodeOf } from '@/common/common.api';
import { copy as commonCopy } from '@/common/common.constants';
import { cn } from '@/common/common.logic';
import { errorMessage } from '@/common/error-messages';
import { testIds } from '@/common/test-ids';
import { showToast } from '@/common/toast';
import { Switch } from '@/common/ui/switch';
import { aiSwitchView } from '@/features/inbox/inbox.logic';
import { useSetContactAi } from '@/features/inbox/thread/inbox.thread.hooks';
import type { ContactDetailDto } from '@/contracts';

type AiSwitchProps = {
  contact: ContactDetailDto;
  /** Global AI setting. When off the switch is off and cannot be pressed. */
  killSwitchOn: boolean;
  /** `sm` is the thread header (label shown only when the header is at least 448px wide); `md` is the info panel. */
  size: 'sm' | 'md';
  /** Shows the one-line note under the switch (info panel only). */
  showNote: boolean;
};

/**
 * "AI replies for this customer" switch (ui-screens 5.2). There is no timed pause: pressing it
 * sends `aiEnabled` at once (optimistic) and a failure puts the old value back with a toast.
 */
export function AiSwitch({ contact, killSwitchOn, size, showNote }: AiSwitchProps) {
  const view = aiSwitchView(contact, killSwitchOn);
  const mutation = useSetContactAi(contact.id);
  const switchId = useId();
  const noteId = useId();
  const isHeader = size === 'sm';
  const ids = isHeader
    ? { switch: testIds.threadAiSwitch, label: testIds.threadAiLabel, note: undefined }
    : { switch: testIds.infoAiSwitch, label: undefined, note: testIds.infoAiNote };

  const toggle = (next: boolean) => {
    mutation.mutate(next, {
      onError: (error) => {
        showToast(
          'error',
          errorMessage(errorCodeOf(error)) ??
            errorMessage('internal.unexpected') ??
            commonCopy.error.network,
        );
      },
    });
  };

  const control = (
    <Switch
      id={switchId}
      data-testid={ids.switch}
      checked={view.checked}
      disabled={view.disabled}
      onCheckedChange={toggle}
      // The visible label is hidden in a narrow header, so the name is also set here.
      aria-label={view.label}
      aria-describedby={showNote ? noteId : undefined}
      className={cn(isHeader && 'scale-[0.8]')}
    />
  );

  if (isHeader) {
    return (
      <div className="flex h-11 items-center gap-1">
        <label
          htmlFor={switchId}
          data-testid={ids.label}
          className="hidden py-0.5 text-sub whitespace-nowrap text-muted @md:inline"
        >
          {view.label}
        </label>
        {/* 44x44 target around the 32x18 switch: a label, so a tap anywhere in it toggles. */}
        <label htmlFor={switchId} className="flex size-11 items-center justify-center">
          {control}
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={switchId} className="py-0.5 text-name font-bold text-fg">
          {view.label}
        </label>
        {control}
      </div>
      {showNote ? (
        <p id={noteId} data-testid={ids.note} className="py-0.5 text-sub text-muted">
          {view.note}
        </p>
      ) : null}
    </div>
  );
}
