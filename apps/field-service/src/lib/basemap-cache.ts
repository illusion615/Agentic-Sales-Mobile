/**
 * The last basemap image, kept across app launches.
 *
 * Fetching the basemap costs a connector round trip, so a cold open shows an
 * empty grid for well over a second. The previous image is geometrically
 * self-describing — it carries the request it was rendered for — so it can be
 * drawn immediately and corrected once the fresh one arrives.
 */
import type { StaticMapRequest } from './static-basemap';

const STORAGE_KEY = 'fs-basemap-last-v1';

export interface CachedBasemap {
  dataUrl: string;
  request: StaticMapRequest;
}

export function loadCachedBasemap(): CachedBasemap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBasemap;
    return parsed?.dataUrl?.startsWith('data:image/') && parsed.request ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedBasemap(entry: CachedBasemap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // A full or disabled store only costs the next launch its head start.
  }
}
