import { useSyncExternalStore } from 'react';

/** Per-browser view preferences. Anything about the *model* lives on the server instead. */
export type Preferences = { showGrid: boolean };

const KEY = 'ddd-studio:preferences';
const defaults: Preferences = { showGrid: true };

function read(): Preferences {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>) };
  } catch {
    return defaults;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function setPreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable (private mode) — the preference just won't persist */
  }
  listeners.forEach((l) => l());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
