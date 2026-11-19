'use client';

// Single-select listbox in the app's theme (WAI-ARIA "select-only combobox"). The browser's own
// <select> popup follows the operating system, not the app, so no screen uses it. Focus stays on
// the trigger; the open list is shown with `aria-activedescendant`. The popup is portalled to
// <body> with fixed coordinates, so a scrolling or clipping parent never cuts it.
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/common/common.logic';

import {
  SELECT_TYPEAHEAD_RESET_MS,
  isTypeaheadKey,
  nextOptionIndex,
  opensList,
  placePopup,
  typeaheadMatch,
  type PopupPlacement,
} from './select.logic';

export type SelectOption<V extends string> = { value: V; label: string };

export type SelectProps<V extends string> = {
  options: readonly SelectOption<V>[];
  /** The chosen value; `null` (or a value not in `options`) shows `placeholder`. */
  value: V | null;
  onValueChange: (value: V) => void;
  /** Id of the visible label (the settings row label). Use this or `aria-label`. */
  'aria-labelledby'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  /** Name of a hidden input that carries the value in a form. */
  name?: string;
  disabled?: boolean;
  /** Saving: the trigger shows a spinner, says it is busy and does not open. */
  pending?: boolean;
  placeholder?: string;
  /** `data-testid` of the trigger. */
  testId?: string;
  /** `data-testid` of every option; each one also has `data-value`. */
  optionTestId?: string;
  className?: string;
};

type Open = { active: number; placement: PopupPlacement | null };

export function Select<V extends string>({
  options,
  value,
  onValueChange,
  'aria-labelledby': labelledBy,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  name,
  disabled = false,
  pending = false,
  placeholder = '',
  testId,
  optionTestId,
  className,
}: SelectProps<V>) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${String(index)}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const [openState, setOpen] = useState<Open | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const labels = options.map((option) => option.label);
  const blocked = disabled || pending;
  // A save that starts or a control that turns off closes the list.
  const open = blocked ? null : openState;

  const close = useCallback(() => {
    setOpen(null);
  }, []);

  const show = (active: number) => {
    if (blocked || options.length === 0) return;
    setOpen({ active: Math.min(Math.max(active, 0), options.length - 1), placement: null });
  };

  const choose = (index: number) => {
    const option = options[index];
    setOpen(null);
    triggerRef.current?.focus();
    if (option !== undefined && option.value !== value) onValueChange(option.value);
  };

  // Place the popup once its list is in the page, and again when the page scrolls or resizes.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (trigger === null || list === null) return;
    const rect = trigger.getBoundingClientRect();
    // The width the labels need, so a list wider than its trigger does not cut them.
    const setWidth = list.style.width;
    list.style.width = 'max-content';
    const naturalWidth = list.offsetWidth;
    list.style.width = setWidth;
    const placement = placePopup({
      trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      listHeight: list.scrollHeight,
      minWidth: naturalWidth,
    });
    setOpen((current) => (current === null ? null : { ...current, placement }));
  }, []);

  const isOpen = open !== null;
  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOpen, place, close]);

  const active = open?.active ?? -1;
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${baseId}-option-${String(active)}`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [active, baseId, open?.placement]);

  const typeahead = (key: string, timeStamp: number, from: number): number | null => {
    const fresh = timeStamp - typed.current.at > SELECT_TYPEAHEAD_RESET_MS;
    const text = (fresh ? '' : typed.current.text) + key;
    typed.current = { text, at: timeStamp };
    return typeaheadMatch(labels, text, from);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (blocked) return;
    const { key } = event;
    const modifiers = { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey };
    const typing =
      typed.current.text !== '' && event.timeStamp - typed.current.at <= SELECT_TYPEAHEAD_RESET_MS;

    if (open === null) {
      if (isTypeaheadKey(key, modifiers)) {
        const match = typeahead(key, event.timeStamp, selectedIndex);
        event.preventDefault();
        show(match ?? selectedIndex);
        return;
      }
      if (!opensList(key)) return;
      event.preventDefault();
      if (key === 'Home') show(0);
      else if (key === 'End') show(options.length - 1);
      else show(selectedIndex);
      return;
    }

    if (key === 'Tab') {
      close();
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // not a dialog or sheet that also listens for Escape
      close();
      return;
    }
    if (key === 'Enter' || (key === ' ' && !typing)) {
      event.preventDefault();
      choose(open.active);
      return;
    }
    if (key === 'ArrowUp' && event.altKey) {
      event.preventDefault();
      choose(open.active);
      return;
    }
    const next = nextOptionIndex(key, open.active, options.length);
    if (next !== null) {
      event.preventDefault();
      setOpen({ ...open, active: next });
      return;
    }
    if (isTypeaheadKey(key, modifiers) || key === ' ') {
      event.preventDefault();
      const match = typeahead(key, event.timeStamp, open.active);
      if (match !== null) setOpen({ ...open, active: match });
    }
  };

  const placement = open?.placement ?? null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && active >= 0 ? optionId(active) : undefined}
        aria-labelledby={labelledBy}
        aria-label={labelledBy === undefined ? ariaLabel : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-busy={pending || undefined}
        disabled={disabled}
        data-slot="select-trigger"
        data-state={isOpen ? 'open' : 'closed'}
        data-value={selected?.value}
        data-testid={testId}
        onClick={() => {
          if (isOpen) close();
          else show(selectedIndex);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
        className={cn(
          'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-[13px] border border-line bg-surface px-3.5 text-left text-[16px] leading-normal text-fg transition-[color,box-shadow] outline-none medium:h-10 medium:text-[15px]',
          'hover:bg-rail focus-visible:border-accent-strong focus-visible:ring-[3px] focus-visible:ring-accent-strong/30',
          'aria-invalid:border-danger aria-invalid:ring-danger/20',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'aria-busy:cursor-progress',
          className,
        )}
      >
        <span className={cn('min-w-0 truncate py-0.5', selected === undefined && 'text-muted')}>
          {selected?.label ?? placeholder}
        </span>
        {pending ? (
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted" />
        ) : (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-muted transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        )}
      </button>
      {name !== undefined ? (
        <input type="hidden" name={name} value={selected?.value ?? ''} />
      ) : null}
      {open !== null
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={labelledBy}
              aria-label={labelledBy === undefined ? ariaLabel : undefined}
              tabIndex={-1}
              data-slot="select-list"
              data-side={placement?.side}
              style={
                placement === null
                  ? { visibility: 'hidden', top: 0, left: 0 }
                  : {
                      top: placement.top,
                      left: placement.left,
                      width: placement.width,
                      maxHeight: placement.maxHeight,
                    }
              }
              className="fixed z-50 overflow-y-auto overscroll-contain rounded-[14px] border border-line bg-surface p-1.5 font-sans text-fg shadow-popover"
            >
              {options.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <li
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    data-active={index === active || undefined}
                    data-value={option.value}
                    data-testid={optionTestId}
                    // Keep focus on the trigger, so the keyboard keeps working after a click.
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseMove={() => {
                      if (index !== active) setOpen({ ...open, active: index });
                    }}
                    onClick={() => {
                      choose(index);
                    }}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-3 py-1.5 text-[16px] leading-normal medium:min-h-10 medium:text-[15px]',
                      index === active && 'bg-selected',
                      isSelected && 'font-bold text-accent-strong',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate py-0.5">{option.label}</span>
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'size-4 shrink-0',
                        isSelected ? 'text-accent-strong' : 'invisible',
                      )}
                    />
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
