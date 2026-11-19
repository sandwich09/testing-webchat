'use client';

import { Search, X } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

import { testIds } from '@/common/test-ids';
import { Input } from '@/common/ui/input';
import { CONTACT_SEARCH_MAX_CHARS } from '@/contracts';

import { copy } from '../inbox.constants';

type ContactSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

/** Capsule search box of the contact list (ui-screens 4.2). Escape or the X button clears it. */
export function ContactSearch({ value, onChange }: ContactSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function clear() {
    onChange('');
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && value !== '') {
      event.preventDefault();
      clear();
    }
  }

  return (
    <div className="relative mx-4 mb-2">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted"
      />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        maxLength={CONTACT_SEARCH_MAX_CHARS}
        placeholder={copy.list.searchPlaceholder}
        aria-label={copy.list.searchPlaceholder}
        autoComplete="off"
        data-testid={testIds.contactSearch}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        className="rounded-full border-0 bg-rail pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value !== '' ? (
        <button
          type="button"
          aria-label={copy.list.clearSearch}
          data-testid={testIds.contactSearchClear}
          onClick={clear}
          className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-4px] medium:right-0 medium:size-10"
        >
          <X aria-hidden="true" className="size-[18px]" />
        </button>
      ) : null}
    </div>
  );
}
