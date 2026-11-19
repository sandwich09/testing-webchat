'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { formatDateTime, formatInt } from '@/common/common.logic';
import { useSettings } from '@/common/common.hooks';
import { ContactAvatar } from '@/common/ContactAvatar';
import { ErrorState } from '@/common/ErrorState';
import { handoffReasonText } from '@/common/error-messages';
import { AVATAR_INFO, THREAD_HEADER_HEIGHT } from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import type { ContactDetailDto } from '@/contracts';
import { copy } from '@/features/inbox/inbox.constants';
import { AiSwitch } from '@/features/inbox/thread/AiSwitch';
import { useContactDetail } from '@/features/inbox/thread/inbox.thread.hooks';
import { fillCopy } from '@/features/inbox/thread/inbox.thread.logic';

type InfoPanelProps = {
  contactId: string;
  onClose: () => void;
  /** `column` sits beside the thread; `sheet` covers its right edge; `fullscreen` fills the screen. */
  mode: 'column' | 'sheet' | 'fullscreen';
};

const isOtherDialogOpen = (): boolean => document.querySelector('[role="dialog"]') !== null;

function InfoSkeleton() {
  return (
    <div data-testid={testIds.infoSkeleton} aria-busy="true">
      <div className="flex flex-col items-center gap-2 px-4 py-5">
        <Skeleton className="rounded-full" style={{ width: AVATAR_INFO, height: AVATAR_INFO }} />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-40" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center justify-between border-t border-line px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <dt className="py-0.5 text-sub text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-body [overflow-wrap:anywhere] tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function InfoBody({ contact, killSwitchOn }: { contact: ContactDetailDto; killSwitchOn: boolean }) {
  // Only the year of "now" matters for the dates; it is read once when the panel opens.
  const [now] = useState(() => new Date());
  const name = contact.displayName ?? copy.contact.unnamed;
  const follow =
    contact.followStatus === 'unfollowed' ? copy.contact.unfollowed : copy.thread.following;

  return (
    <div data-testid={testIds.infoPanel}>
      <div className="flex flex-col items-center gap-1 px-4 py-5 text-center">
        <ContactAvatar
          name={name}
          pictureUrl={contact.pictureUrl}
          contactId={contact.id}
          size={AVATAR_INFO}
        />
        <p
          data-testid={testIds.infoName}
          className="mt-1 text-section font-bold [overflow-wrap:anywhere]"
        >
          {name}
        </p>
        {contact.followedAt === null ? null : (
          <p data-testid={testIds.infoFollowedAt} className="text-sub text-muted">
            {fillCopy(copy.info.followedAt, { date: formatDateTime(contact.followedAt, now) })}
          </p>
        )}
      </div>

      <div className="border-y border-line px-4 py-2">
        <AiSwitch contact={contact} killSwitchOn={killSwitchOn} size="md" showNote />
      </div>

      <dl>
        <DetailRow label={copy.info.status}>
          <div data-testid={testIds.infoStatus}>
            <p>{follow}</p>
            {contact.needsAdmin ? <p className="text-warn">{copy.thread.needsAdmin}</p> : null}
          </div>
          {contact.needsAdmin && contact.needsAdminReason !== null ? (
            <p className="mt-0.5 text-sub text-muted">
              {handoffReasonText(contact.needsAdminReason)}
            </p>
          ) : null}
        </DetailRow>
        <DetailRow label={copy.info.messageCount}>
          <span data-testid={testIds.infoMessageCount}>
            {formatInt(contact.stats.messageCount)}
          </span>
        </DetailRow>
        <DetailRow label={copy.info.aiReplyCount}>
          <span data-testid={testIds.infoAiReplyCount}>
            {fillCopy(copy.info.timesValue, { n: formatInt(contact.stats.aiMessageCount) })}
          </span>
        </DetailRow>
        <DetailRow label={copy.info.lastContact}>
          <span data-testid={testIds.infoLastContact}>
            {contact.lastMessage === null
              ? copy.preview.none
              : formatDateTime(contact.lastMessage.at, now)}
          </span>
        </DetailRow>
      </dl>
    </div>
  );
}

/**
 * Customer info panel (ui-screens 6). Shows the profile, the AI switch and four facts. It never
 * shows tokens or cost. As a sheet or full screen it closes with Escape (and a click outside, as
 * a sheet) and gives focus back to the toggle in the thread header.
 */
export function InfoPanel({ contactId, onClose, mode }: InfoPanelProps) {
  const contact = useContactDetail(contactId);
  const settings = useSettings();
  const killSwitchOn = settings.data?.ai.enabled ?? true;
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mode === 'column') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !isOtherDialogOpen()) onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (mode !== 'sheet' || !(event.target instanceof Element)) return;
      if (rootRef.current?.contains(event.target)) return;
      // The header toggle closes the sheet itself; toasts and dialogs are not "outside".
      if (
        event.target.closest(`[data-testid="${testIds.threadInfoToggle}"], [data-sonner-toaster]`)
      ) {
        return;
      }
      if (!isOtherDialogOpen()) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [mode, onClose]);

  useEffect(() => {
    if (mode === 'column') return;
    closeRef.current?.focus();
    return () => {
      document.querySelector<HTMLElement>(`[data-testid="${testIds.threadInfoToggle}"]`)?.focus();
    };
  }, [mode]);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div
        style={{ height: THREAD_HEADER_HEIGHT }}
        className="flex shrink-0 items-center justify-between gap-2 border-b border-line pr-2 pl-4"
      >
        <h2 className="py-0.5 text-section leading-normal font-bold">{copy.info.title}</h2>
        <button
          ref={closeRef}
          type="button"
          data-testid={testIds.infoClose}
          aria-label={copy.info.close}
          onClick={onClose}
          className="flex size-11 items-center justify-center rounded-full text-fg hover:bg-selected medium:size-9"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {contact.data !== undefined ? (
          <InfoBody contact={contact.data} killSwitchOn={killSwitchOn} />
        ) : contact.isError ? (
          <ErrorState
            message={copy.info.error}
            testId={testIds.infoError}
            onRetry={() => {
              void contact.refetch();
            }}
          />
        ) : (
          <InfoSkeleton />
        )}
      </div>
    </div>
  );
}
