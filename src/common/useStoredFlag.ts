'use client';

import { useCallback, useSyncExternalStore } from 'react';

// A boolean kept in `localStorage` (per-viewer convenience such as the collapsed rail). Storage can be
// blocked or throw, so every access is wrapped and an in-memory copy keeps the choice until reload.
// The server render and hydration always use `fallback`, so markup never differs between the two.
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Storage is not available; fall through to the in-memory copy.
  }
  return memory.get(key) ?? fallback;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useStoredFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // Not persisted; the in-memory copy keeps it until reload.
      }
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [value, set];
}
