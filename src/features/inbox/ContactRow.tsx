import Link from 'next/link';

import { cn } from '@/common/common.logic';
import { ContactAvatar } from '@/common/ContactAvatar';
import { AVATAR_LIST } from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import type { ContactDto, ContactFilter } from '@/contracts';

import { copy } from './inbox.constants';
import { contactHref, unreadAriaText, unreadBadgeText } from './inbox.list.logic';
import { buildContactPreview, formatListTime } from './inbox.logic';

type ContactRowProps = {
  contact: ContactDto;
  selected: boolean;
  now: Date;
  /** Tab in use; kept in the link so the tab survives opening a chat. */
  filter?: ContactFilter;
  /** Roving tabindex: only one row of the list is in the tab order. */
  tabbable?: boolean;
  onFocus?: () => void;
};

/** One contact in the list (ui-screens 4.2). The whole row is a link to the chat. */
export function ContactRow({
  contact,
  selected,
  now,
  filter = 'all',
  tabbable = true,
  onFocus,
}: ContactRowProps) {
  const preview = buildContactPreview(contact);
  const unread = contact.unreadCount > 0;
  const unfollowed = contact.followStatus === 'unfollowed';
  const name =
    (contact.displayName ?? '').trim() === '' ? copy.contact.unnamed : (contact.displayName ?? '');

  return (
    <li>
      <Link
        href={contactHref(contact.id, filter)}
        prefetch={false}
        tabIndex={tabbable ? 0 : -1}
        aria-current={selected ? 'page' : undefined}
        onFocus={onFocus}
        data-testid={testIds.contactRow}
        data-contact-id={contact.id}
        data-unread={unread ? 'true' : 'false'}
        data-needs-admin={contact.needsAdmin ? 'true' : 'false'}
        data-follow={contact.followStatus}
        data-selected={selected ? 'true' : 'false'}
        className={cn(
          'flex min-h-[72px] items-center gap-3 px-4 py-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] medium:min-h-[68px]',
          selected ? 'bg-selected' : 'hover:bg-rail',
        )}
      >
        <span className={cn('shrink-0', unfollowed && 'opacity-[0.55]')}>
          <ContactAvatar
            name={name}
            pictureUrl={contact.pictureUrl}
            contactId={contact.id}
            size={AVATAR_LIST}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              data-testid={testIds.contactRowName}
              className={cn(
                'min-w-0 flex-1 truncate py-0.5 text-name',
                unread && 'font-bold',
                // Faded with the muted colour, not opacity: 0.55 of `fg` fails 4.5:1 contrast.
                unfollowed ? 'text-muted' : 'text-fg',
              )}
            >
              {name}
            </span>
            <span
              data-testid={testIds.contactRowTime}
              className="shrink-0 py-0.5 text-meta whitespace-nowrap text-muted"
            >
              {formatListTime(contact.lastMessage?.at ?? contact.createdAt, now)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span
              data-testid={testIds.contactRowPreview}
              className={cn(
                'min-w-0 flex-1 truncate py-0.5 text-sub',
                unread ? 'font-bold text-fg' : 'text-muted',
              )}
            >
              {preview.prefix !== null ? (
                <>
                  <span
                    className={preview.prefixTone === 'warn' ? 'font-bold text-warn' : undefined}
                  >
                    {preview.prefix}
                  </span>{' '}
                </>
              ) : null}
              {preview.text}
            </span>
            {unread ? (
              <span
                data-testid={testIds.contactRowUnread}
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-strong px-1.5 text-meta leading-5 font-bold text-white tabular-nums"
              >
                <span aria-hidden="true">{unreadBadgeText(contact.unreadCount)}</span>
                <span className="sr-only">{unreadAriaText(contact.unreadCount)}</span>
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
