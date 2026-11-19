// Pure helpers of the themed select (select.tsx): keyboard movement, type-ahead and where the
// popup goes. No React and no browser API, so they are unit tested on their own.

/** How far PageUp and PageDown move the active option. */
export const SELECT_PAGE_STEP = 10;
/** Type-ahead keys typed within this time form one search string. */
export const SELECT_TYPEAHEAD_RESET_MS = 500;
/** Tallest the popup gets before it scrolls inside. */
export const SELECT_POPUP_MAX_HEIGHT = 320;
/** Space between the trigger and the popup. */
export const SELECT_POPUP_GAP = 4;
/** Space the popup keeps from the viewport edges. */
export const SELECT_VIEWPORT_MARGIN = 8;

/**
 * Index the active option moves to for a navigation key of an open list, clamped at both ends
 * (the list does not wrap). `null` for a key that does not move.
 */
export function nextOptionIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const from = Math.min(Math.max(current, -1), last);
  switch (key) {
    case 'ArrowDown':
      return Math.min(from + 1, last);
    case 'ArrowUp':
      return from < 0 ? 0 : Math.max(from - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'PageDown':
      return Math.min(Math.max(from, 0) + SELECT_PAGE_STEP, last);
    case 'PageUp':
      return Math.max(from - SELECT_PAGE_STEP, 0);
    default:
      return null;
  }
}

/** Whether a key on a closed trigger opens the list. */
export function opensList(key: string): boolean {
  return (
    key === 'Enter' ||
    key === ' ' ||
    key === 'ArrowDown' ||
    key === 'ArrowUp' ||
    key === 'Home' ||
    key === 'End'
  );
}

/** Whether a key is a printable character that type-ahead uses (no modifier held). */
export function isTypeaheadKey(
  key: string,
  modifiers: { ctrl: boolean; meta: boolean; alt: boolean },
): boolean {
  return key.length === 1 && key !== ' ' && !modifiers.ctrl && !modifiers.meta && !modifiers.alt;
}

function normalize(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('th');
}

/**
 * Option a type-ahead string points at: the first label that starts with it, searching after the
 * current option. A string of one repeated letter cycles through the labels that start with that
 * letter; a longer string keeps the current option while it still matches. `null` when none match.
 */
export function typeaheadMatch(
  labels: readonly string[],
  search: string,
  current: number,
): number | null {
  const count = labels.length;
  if (count === 0 || search === '') return null;
  const query = normalize(search);
  const first = query.charAt(0);
  const repeated = query === first.repeat(query.length);
  const needle = repeated ? first : query;
  // One letter (or one letter repeated) moves on from the current option; a word may stay on it.
  const offset = repeated ? 1 : 0;
  const start = current < 0 ? 0 : current + offset;
  for (let i = 0; i < count; i += 1) {
    const index = (start + i) % count;
    const label = labels[index];
    if (label !== undefined && normalize(label).startsWith(needle)) return index;
  }
  return null;
}

export type PopupPlacement = {
  side: 'below' | 'above';
  /** Viewport px of the popup's top edge (below) or bottom edge measured from the top (above). */
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Where the popup goes: under the trigger, or above it when the list does not fit below and
 * there is more room above. It is at least as wide as the trigger, never wider than the viewport
 * less its margins, and kept inside the viewport horizontally. `maxHeight` is what fits on the
 * chosen side, so a long list scrolls inside the popup.
 */
export function placePopup(input: {
  trigger: { top: number; bottom: number; left: number; width: number };
  viewport: { width: number; height: number };
  /** Natural height of the list (its scroll height). */
  listHeight: number;
  /** Width the popup wants beyond the trigger's, e.g. for long labels. */
  minWidth?: number;
}): PopupPlacement {
  const { trigger, viewport, listHeight } = input;
  const margin = SELECT_VIEWPORT_MARGIN;
  const gap = SELECT_POPUP_GAP;
  const wanted = Math.min(listHeight, SELECT_POPUP_MAX_HEIGHT);
  const below = viewport.height - trigger.bottom - gap - margin;
  const above = trigger.top - gap - margin;
  const side = below >= wanted || below >= above ? 'below' : 'above';
  const room = Math.max(side === 'below' ? below : above, 0);
  const maxHeight = Math.min(SELECT_POPUP_MAX_HEIGHT, room);
  const height = Math.min(wanted, maxHeight);

  const available = Math.max(viewport.width - 2 * margin, 0);
  const width = Math.min(Math.max(trigger.width, input.minWidth ?? 0), available);
  const left = Math.min(
    Math.max(trigger.left, margin),
    Math.max(viewport.width - margin - width, margin),
  );
  const top = side === 'below' ? trigger.bottom + gap : trigger.top - gap - height;
  return { side, top, left, width, maxHeight };
}
