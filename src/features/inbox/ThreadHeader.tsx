import { ChevronLeft, PanelRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/common/common.logic';
import { ContactAvatar } from '@/common/ContactAvatar';
import { AVATAR_HEADER, THREAD_HEADER_HEIGHT } from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import type { ContactDetailDto } from '@/contracts';
import { AiSwitch } from '@/features/inbox/AiSwitch';
import { copy } from '@/features/inbox/inbox.constants';
import { threadSubline } from '@/features/inbox/inbox.logic';

type ThreadHeaderProps = {
  contact: ContactDetailDto;
  killSwitchOn: boolean;
  infoOpen: boolean;
  onToggleInfo: () => void;
};

/** Thread header (ui-screens 5.2): back (narrow), picture, name and subline, AI switch, info toggle. */
export function ThreadHeader({ contact, killSwitchOn, infoOpen, onToggleInfo }: ThreadHeaderProps) {
  const name = contact.displayName ?? copy.contact.unnamed;
  const subline = threadSubline(contact, killSwitchOn);

  return (
    <header
      data-testid={testIds.threadHeader}
      style={{ height: THREAD_HEADER_HEIGHT }}
      className="@container flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4"
    >
      <Link
        href="/chats"
        aria-label={copy.thread.back}
        data-testid={testIds.threadBack}
        className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-selected medium:hidden"
      >
        <ChevronLeft aria-hidden="true" className="size-6" />
      </Link>

      <ContactAvatar
        name={name}
        pictureUrl={contact.pictureUrl}
        contactId={contact.id}
        size={AVATAR_HEADER}
      />

      <div className="min-w-0 flex-1">
        <h2
          data-testid={testIds.threadName}
          className="truncate py-0.5 text-name leading-normal font-bold"
        >
          {name}
        </h2>
        <p
          data-testid={testIds.threadSubline}
          className="truncate py-0.5 text-meta leading-normal text-muted"
        >
          {subline.follow}
          {subline.ai === null ? null : (
            <>
              {' · '}
              <span className={cn(subline.aiTone === 'warn' && 'text-warn')}>{subline.ai}</span>
            </>
          )}
        </p>
      </div>

      <AiSwitch contact={contact} killSwitchOn={killSwitchOn} size="sm" showNote={false} />

      <button
        type="button"
        data-testid={testIds.threadInfoToggle}
        aria-label={infoOpen ? copy.thread.hideInfo : copy.thread.showInfo}
        aria-expanded={infoOpen}
        onClick={onToggleInfo}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-fg hover:bg-selected medium:size-9"
      >
        <PanelRight aria-hidden="true" className="size-5" />
      </button>
    </header>
  );
}
