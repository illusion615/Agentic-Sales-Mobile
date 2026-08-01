/**
 * Daily lifecycle for the browser-only demo data.
 *
 * Edge and the Power Apps mobile player are separate storage containers, so
 * local data can never be truly cross-device. Resetting the fixture baseline on
 * the first launch of each local calendar day keeps both containers on the same
 * demo schedule while preserving edits made during that day.
 */

const PREFIX = 'fs-fixture-day-v3';

export function localDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface FixtureCycle {
  shouldReset: boolean;
  markReady: () => void;
}

export function fixtureCycle(scope: string, storage: Pick<Storage, 'getItem' | 'setItem'> | null): FixtureCycle {
  const key = `${PREFIX}:${scope}`;
  const today = localDayKey();
  let previous: string | null = null;

  try {
    previous = storage?.getItem(key) ?? null;
  } catch {
    // A blocked localStorage should not stop the app from loading its fixtures.
  }

  return {
    shouldReset: previous !== today,
    markReady() {
      try {
        storage?.setItem(key, today);
      } catch {
        // IndexedDB remains usable even when localStorage is unavailable.
      }
    },
  };
}

export function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
