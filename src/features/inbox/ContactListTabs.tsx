'use client';

import { useRef, type KeyboardEvent } from 'react';

import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import type { ContactFilter } from '@/contracts';

import { copy } from './inbox.constants';
import { nextTabIndex } from './inbox.list.logic';

type ContactListTabsProps = {
  filter: ContactFilter;
  onChange: (filter: ContactFilter) => void;
  /** Null until the first page has loaded; the tabs then show no number. */
  counts: { unread: number; needsAdmin: number } | null;
  /** id of the element the tabs control (the list panel). */
  panelId: string;
};

const TABS: readonly { filter: ContactFilter; testId: string }[] = [
  { filter: 'all', testId: testIds.contactTabAll },
  { filter: 'unread', testId: testIds.contactTabUnread },
  { filter: 'needs_admin', testId: testIds.contactTabNeedsAdmin },
];

/** Underline tabs: all, unread and waiting for admin, with counts (ui-screens 4.2 and 4.5). */
export function ContactListTabs({ filter, onChange, counts, panelId }: ContactListTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function label(tab: ContactFilter): string {
    if (tab === 'all') return copy.list.tabAll;
    const text = tab === 'unread' ? copy.list.tabUnread : copy.list.tabNeedsAdmin;
    if (counts === null) return text;
    return `${text} ${String(tab === 'unread' ? counts.unread : counts.needsAdmin)}`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTabIndex(event.key, index, TABS.length);
    const target = next === null ? undefined : TABS[next];
    if (next === null || target === undefined) return;
    event.preventDefault();
    onChange(target.filter);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={copy.list.tabsLabel}
      className="flex border-b border-line px-2 medium:px-4"
    >
      {TABS.map((tab, index) => {
        const selected = tab.filter === filter;
        return (
          <button
            key={tab.filter}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${tab.filter}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            data-testid={tab.testId}
            onClick={() => {
              onChange(tab.filter);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className={cn(
              'relative flex min-h-11 flex-1 items-center justify-center px-2 py-2 text-sub whitespace-nowrap tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
              selected ? 'font-bold text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {label(tab.filter)}
            {selected ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
