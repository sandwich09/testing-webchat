'use client';

// Popover of canned replies above the composer (ui-screens 5.9); a sheet from the bottom on a
// narrow screen. Picking inserts the text into the composer, it never sends.
import Link from 'next/link';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { useCannedReplies } from '@/common/common.hooks';
import { copy as commonCopy } from '@/common/common.constants';
import { cn } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';

import { copy } from '../inbox.constants';
import { filterCannedReplies } from '../inbox.logic';

export type CannedReplyPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (text: string) => void;
  /** The canned reply button: the popover lines up with it and focus returns to it on Escape. */
  anchorRef: RefObject<HTMLElement | null>;
};

export function CannedReplyPicker(props: CannedReplyPickerProps): JSX.Element | null {
  // The list is only fetched while the picker is open.
  return props.open ? <PickerPanel {...props} /> : null;
}

function PickerPanel({ onClose, onPick, anchorRef }: CannedReplyPickerProps): JSX.Element {
  const query = useCannedReplies();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [left, setLeft] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const listId = `${baseId}-list`;
  const optionId = (id: string) => `${baseId}-option-${id}`;

  const items = useMemo(() => filterCannedReplies(query.data ?? [], search), [query.data, search]);
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;

  // Line up with the button (wide screens; the narrow sheet ignores `left`).
  useLayoutEffect(() => {
    setLeft(anchorRef.current?.offsetLeft ?? 0);
  }, [anchorRef]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (activeItem === undefined) return;
    document
      .getElementById(`${baseId}-option-${activeItem.id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeItem, baseId]);

  // A click outside closes it; the button itself toggles it in the composer.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [anchorRef, onClose]);

  const pick = (text: string) => {
    onPick(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (items.length > 0) setActive((activeIndex + 1) % items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (items.length > 0) setActive((activeIndex - 1 + items.length) % items.length);
        break;
      case 'Enter':
        event.preventDefault();
        if (!event.nativeEvent.isComposing && activeItem !== undefined) pick(activeItem.text);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // not the info sheet or anything else listening for Escape
        onClose();
        anchorRef.current?.focus();
        break;
      default:
        break;
    }
  };

  let body: JSX.Element;
  if (query.isPending) {
    body = (
      <div className="flex flex-col gap-2 p-3" aria-busy="true" aria-label={commonCopy.loading}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-[10px]" />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <div
        data-testid={testIds.cannedPickerError}
        className="flex flex-col items-start gap-2 p-4 text-sub"
      >
        <p className="text-fg">{copy.canned.error}</p>
        <button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
          className="h-11 rounded-full border border-line px-4 font-bold hover:bg-selected medium:h-8"
        >
          {commonCopy.action.retry}
        </button>
      </div>
    );
  } else if (query.data.length === 0) {
    body = (
      <div
        data-testid={testIds.cannedPickerEmpty}
        className="flex flex-col items-start gap-1 p-4 text-sub"
      >
        <p className="text-muted">{copy.canned.empty}</p>
        <Link href="/settings" className="font-bold text-fg underline underline-offset-4">
          {copy.canned.goToSettings}
        </Link>
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="p-4 text-sub text-muted">{copy.canned.noMatch}</p>;
  } else {
    body = (
      <ul id={listId} role="listbox" aria-labelledby={titleId} className="overflow-y-auto p-1.5">
        {items.map((item, index) => (
          <li
            key={item.id}
            id={optionId(item.id)}
            role="option"
            aria-selected={index === activeIndex}
            data-testid={testIds.cannedOption}
            data-id={item.id}
            // Keep focus in the search box so the keyboard keeps working after a click.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onMouseEnter={() => {
              setActive(index);
            }}
            onClick={() => {
              pick(item.text);
            }}
            className={cn(
              'flex min-h-[52px] cursor-pointer flex-col justify-center rounded-[10px] px-3 py-1.5',
              index === activeIndex && 'bg-selected',
            )}
          >
            <span className="truncate py-0.5 text-[15px] leading-normal font-bold text-fg">
              {item.title}
            </span>
            <span className="truncate py-0.5 text-sub leading-normal text-muted">{item.text}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      data-testid={testIds.cannedPicker}
      style={{ ['--picker-left' as string]: `${String(left)}px` }}
      onBlur={(event) => {
        // Tab out of the popover closes it (ui-screens 5.9).
        const next = event.relatedTarget;
        if (!(next instanceof Node) || event.currentTarget.contains(next)) return;
        // Focus moving to the canned button: its click toggles the picker itself.
        if (anchorRef.current?.contains(next)) return;
        onClose();
      }}
      className={cn(
        'z-30 flex flex-col overflow-hidden border border-line bg-surface shadow-[0_12px_32px_rgba(25,19,39,.14)]',
        // narrow: a sheet from the bottom, full width, up to 70% of the screen
        'fixed inset-x-0 bottom-0 max-h-[70dvh] rounded-t-[14px]',
        // medium and wide: a popover above the composer, aligned with the button
        'medium:absolute medium:inset-x-auto medium:bottom-full medium:left-[var(--picker-left)] medium:mb-1 medium:max-h-[360px] medium:w-[340px] medium:rounded-[14px]',
      )}
    >
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <h3 id={titleId} className="text-section font-bold">
          {copy.canned.title}
        </h3>
        <input
          ref={searchRef}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeItem === undefined ? undefined : optionId(activeItem.id)}
          aria-label={copy.canned.searchPlaceholder}
          placeholder={copy.canned.searchPlaceholder}
          data-testid={testIds.cannedPickerSearch}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-11 rounded-full bg-rail px-4 text-[16px] leading-normal text-fg outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent-strong medium:h-9 medium:text-[15px]"
        />
      </div>
      {body}
    </div>
  );
}
