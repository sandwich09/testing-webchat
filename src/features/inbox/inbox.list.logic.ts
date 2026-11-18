// Pure logic of the contact list components (ui-screens 4). No clock, no browser.
import { CONTACT_FILTERS, DEFAULT_CONTACT_FILTER, type ContactFilter } from '@/contracts';

import { copy } from './inbox.constants';

/** The `?filter=` value of the URL as a filter. Anything unknown is `all`. */
export function parseFilter(value: string | null | undefined): ContactFilter {
  return CONTACT_FILTERS.find((f) => f === value) ?? DEFAULT_CONTACT_FILTER;
}

/** The `?filter=` query to write for a filter. `all` is the default and leaves the URL clean. */
export function filterQuery(filter: ContactFilter): string {
  return filter === DEFAULT_CONTACT_FILTER ? '' : `?filter=${filter}`;
}

/** Link of a row. A chosen tab stays chosen after opening a chat. */
export function contactHref(contactId: string, filter: ContactFilter): string {
  return `/chats/${encodeURIComponent(contactId)}${filterQuery(filter)}`;
}

/** Text of the unread capsule: "99+" above 99. */
export function unreadBadgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Screen-reader text of the unread capsule (`inbox.list.unreadAria`). */
export function unreadAriaText(count: number): string {
  return copy.list.unreadAria.replace('{n}', String(count));
}

export type ListEmpty =
  | { kind: 'search'; text: string }
  | { kind: 'unread'; text: string }
  | { kind: 'needsAdmin'; text: string }
  | { kind: 'noLine'; title: string; body: string }
  | { kind: 'noContacts'; title: string; body: string };

/** Which empty state to show for a list with no rows (ui-screens 4.3). `q` is already trimmed. */
export function emptyState(filter: ContactFilter, q: string, lineConfigured: boolean): ListEmpty {
  if (q !== '') return { kind: 'search', text: copy.list.emptySearch.replace('{q}', q) };
  if (filter === 'unread') return { kind: 'unread', text: copy.list.emptyUnread };
  if (filter === 'needs_admin') return { kind: 'needsAdmin', text: copy.list.emptyNeedsAdmin };
  if (!lineConfigured) return { kind: 'noLine', ...copy.list.emptyNoLine };
  return { kind: 'noContacts', ...copy.list.empty };
}

/**
 * Index to focus after a key in the list (roving tabindex, ui-screens 4.5), or null when the key
 * is not one of the list keys.
 */
export function nextRowIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return Math.min(current + 1, count - 1);
    case 'ArrowUp':
      return Math.max(current - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Tab to select after ArrowLeft or ArrowRight; wraps around. Null for any other key. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The row that is in the tab order: the one that has focus, else the selected chat, else the
 * first. Null when the list is empty.
 */
export function tabbableRowId(
  ids: readonly string[],
  focusedId: string | null,
  selectedId: string | null,
): string | null {
  if (focusedId !== null && ids.includes(focusedId)) return focusedId;
  if (selectedId !== null && ids.includes(selectedId)) return selectedId;
  return ids[0] ?? null;
}
