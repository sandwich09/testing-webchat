import { describe, expect, it } from 'vitest';

import {
  contactHref,
  emptyState,
  filterQuery,
  nextRowIndex,
  parseFilter,
  tabbableRowId,
  unreadAriaText,
  unreadBadgeText,
} from './inbox.list.logic';

describe('parseFilter and filterQuery', () => {
  it('reads known filters and falls back to all', () => {
    expect(parseFilter('unread')).toBe('unread');
    expect(parseFilter('needs_admin')).toBe('needs_admin');
    expect(parseFilter('all')).toBe('all');
    expect(parseFilter('nope')).toBe('all');
    expect(parseFilter(null)).toBe('all');
    expect(parseFilter(undefined)).toBe('all');
  });

  it('keeps the URL clean for the default filter', () => {
    expect(filterQuery('all')).toBe('');
    expect(filterQuery('unread')).toBe('?filter=unread');
    expect(filterQuery('needs_admin')).toBe('?filter=needs_admin');
  });

  it('builds row links', () => {
    expect(contactHref('abc', 'all')).toBe('/chats/abc');
    expect(contactHref('abc', 'unread')).toBe('/chats/abc?filter=unread');
    expect(contactHref('a/b', 'all')).toBe('/chats/a%2Fb');
  });
});

describe('unread capsule', () => {
  it('caps the text at 99+', () => {
    expect(unreadBadgeText(1)).toBe('1');
    expect(unreadBadgeText(99)).toBe('99');
    expect(unreadBadgeText(100)).toBe('99+');
  });

  it('builds the screen-reader text', () => {
    expect(unreadAriaText(3)).toBe('3 ข้อความยังไม่อ่าน');
  });
});

describe('emptyState', () => {
  it('prefers the search text, with the typed text in it', () => {
    expect(emptyState('unread', 'มะลิ', true)).toEqual({
      kind: 'search',
      text: 'ไม่พบผู้ใช้ชื่อ “มะลิ”',
    });
  });

  it('picks the tab text', () => {
    expect(emptyState('unread', '', true).kind).toBe('unread');
    expect(emptyState('needs_admin', '', false).kind).toBe('needsAdmin');
  });

  it('asks to connect LINE only on the all tab without a connection', () => {
    expect(emptyState('all', '', false).kind).toBe('noLine');
    expect(emptyState('all', '', true).kind).toBe('noContacts');
  });
});

describe('nextRowIndex', () => {
  it('moves and clamps at the ends', () => {
    expect(nextRowIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextRowIndex('ArrowDown', 2, 3)).toBe(2);
    expect(nextRowIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextRowIndex('ArrowUp', 0, 3)).toBe(0);
    expect(nextRowIndex('Home', 2, 3)).toBe(0);
    expect(nextRowIndex('End', 0, 3)).toBe(2);
  });

  it('ignores other keys and empty lists', () => {
    expect(nextRowIndex('a', 0, 3)).toBeNull();
    expect(nextRowIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('tabbableRowId', () => {
  const ids = ['a', 'b', 'c'];
  it('prefers focus, then the selected chat, then the first row', () => {
    expect(tabbableRowId(ids, 'c', 'b')).toBe('c');
    expect(tabbableRowId(ids, 'x', 'b')).toBe('b');
    expect(tabbableRowId(ids, null, 'x')).toBe('a');
    expect(tabbableRowId([], null, null)).toBeNull();
  });
});
