import { describe, expect, it } from 'vitest';

import {
  SELECT_POPUP_GAP,
  SELECT_POPUP_MAX_HEIGHT,
  SELECT_VIEWPORT_MARGIN,
  isTypeaheadKey,
  nextOptionIndex,
  opensList,
  placePopup,
  typeaheadMatch,
} from './select.logic';

describe('nextOptionIndex', () => {
  it('moves one step with the arrows and stops at both ends', () => {
    expect(nextOptionIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextOptionIndex('ArrowDown', 2, 3)).toBe(2);
    expect(nextOptionIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextOptionIndex('ArrowUp', 0, 3)).toBe(0);
  });

  it('starts from the first option when nothing is active', () => {
    expect(nextOptionIndex('ArrowDown', -1, 3)).toBe(0);
    expect(nextOptionIndex('ArrowUp', -1, 3)).toBe(0);
  });

  it('jumps to the ends with Home and End and by ten with the page keys', () => {
    expect(nextOptionIndex('Home', 2, 3)).toBe(0);
    expect(nextOptionIndex('End', 0, 3)).toBe(2);
    expect(nextOptionIndex('PageDown', 1, 30)).toBe(11);
    expect(nextOptionIndex('PageDown', 25, 30)).toBe(29);
    expect(nextOptionIndex('PageUp', 5, 30)).toBe(0);
  });

  it('ignores other keys and an empty list', () => {
    expect(nextOptionIndex('a', 0, 3)).toBeNull();
    expect(nextOptionIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('opensList', () => {
  it('opens on Enter, Space, the arrows, Home and End only', () => {
    for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(opensList(key)).toBe(true);
    }
    for (const key of ['Tab', 'Escape', 'a', 'ArrowLeft']) expect(opensList(key)).toBe(false);
  });
});

describe('isTypeaheadKey', () => {
  const none = { ctrl: false, meta: false, alt: false };
  it('takes printable characters, Thai included, without modifiers', () => {
    expect(isTypeaheadKey('s', none)).toBe(true);
    expect(isTypeaheadKey('พ', none)).toBe(true);
    expect(isTypeaheadKey(' ', none)).toBe(false);
    expect(isTypeaheadKey('Enter', none)).toBe(false);
    expect(isTypeaheadKey('s', { ...none, ctrl: true })).toBe(false);
    expect(isTypeaheadKey('s', { ...none, meta: true })).toBe(false);
  });
});

describe('typeaheadMatch', () => {
  const models = ['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5'];
  const months = ['พ.ย. 2569', 'ต.ค. 2569', 'ก.ย. 2569', 'ส.ค. 2569', 'ก.ค. 2569'];

  it('finds the first label that starts with the typed text, ignoring case', () => {
    expect(typeaheadMatch(models, 'claude s', 0)).toBe(1);
    expect(typeaheadMatch(models, 'CLAUDE H', 0)).toBe(2);
  });

  it('keeps the current option while a longer word still matches it', () => {
    expect(typeaheadMatch(models, 'cl', 1)).toBe(1);
  });

  it('cycles through labels with the same first letter when one letter is typed again', () => {
    expect(typeaheadMatch(models, 'c', 0)).toBe(1);
    expect(typeaheadMatch(models, 'cc', 2)).toBe(0);
    expect(typeaheadMatch(months, 'ก', 0)).toBe(2);
    expect(typeaheadMatch(months, 'ก', 2)).toBe(4);
    expect(typeaheadMatch(months, 'ก', 4)).toBe(2);
  });

  it('matches Thai text by its first letters', () => {
    expect(typeaheadMatch(months, 'ส.', 0)).toBe(3);
  });

  it('returns null when nothing matches or there is nothing to search', () => {
    expect(typeaheadMatch(models, 'x', 0)).toBeNull();
    expect(typeaheadMatch([], 'c', 0)).toBeNull();
    expect(typeaheadMatch(models, '', 0)).toBeNull();
  });
});

describe('placePopup', () => {
  const viewport = { width: 1280, height: 800 };
  const trigger = { top: 100, bottom: 140, left: 900, width: 220 };

  it('opens below the trigger when the list fits', () => {
    const placed = placePopup({ trigger, viewport, listHeight: 150 });
    expect(placed.side).toBe('below');
    expect(placed.top).toBe(140 + SELECT_POPUP_GAP);
    expect(placed.left).toBe(900);
    expect(placed.width).toBe(220);
    expect(placed.maxHeight).toBe(SELECT_POPUP_MAX_HEIGHT);
  });

  it('flips above when the list does not fit below and there is more room above', () => {
    const low = { top: 700, bottom: 740, left: 900, width: 220 };
    const placed = placePopup({ trigger: low, viewport, listHeight: 150 });
    expect(placed.side).toBe('above');
    expect(placed.top).toBe(700 - SELECT_POPUP_GAP - 150);
  });

  it('stays below when there is less room above than below, and shrinks to fit', () => {
    const tall = { width: 390, height: 300 };
    const mid = { top: 120, bottom: 160, left: 16, width: 358 };
    const placed = placePopup({ trigger: mid, viewport: tall, listHeight: 400 });
    expect(placed.side).toBe('below');
    expect(placed.maxHeight).toBe(300 - 160 - SELECT_POPUP_GAP - SELECT_VIEWPORT_MARGIN);
  });

  it('never runs past the viewport edges at 390px', () => {
    const narrow = { width: 390, height: 844 };
    const wide = placePopup({
      trigger: { top: 100, bottom: 144, left: 200, width: 180 },
      viewport: narrow,
      listHeight: 100,
      minWidth: 600,
    });
    expect(wide.width).toBe(390 - 2 * SELECT_VIEWPORT_MARGIN);
    expect(wide.left).toBe(SELECT_VIEWPORT_MARGIN);
    const right = placePopup({
      trigger: { top: 100, bottom: 144, left: 300, width: 180 },
      viewport: narrow,
      listHeight: 100,
    });
    expect(right.left + right.width).toBeLessThanOrEqual(390 - SELECT_VIEWPORT_MARGIN);
  });

  it('gives no negative height when the trigger is off screen', () => {
    const placed = placePopup({
      trigger: { top: -200, bottom: -160, left: 0, width: 200 },
      viewport: { width: 390, height: 100 },
      listHeight: 100,
    });
    expect(placed.maxHeight).toBeGreaterThanOrEqual(0);
  });
});
