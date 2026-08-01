import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCachedBasemap, saveCachedBasemap } from '@/lib/basemap-cache';
import type { StaticMapRequest } from '@/lib/static-basemap';

const REQUEST: StaticMapRequest = {
  center: { latitude: 22.5455, longitude: 114.0637 },
  serviceZoom: 12,
  projectionZoom: 13,
  widthPx: 393,
  heightPx: 852,
  scale: 1,
  traffic: false,
};

const ENTRY = { dataUrl: 'data:image/png;base64,AAAA', request: REQUEST };

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('basemap cache', () => {
  it('returns nothing on a first ever launch', () => {
    expect(loadCachedBasemap()).toBeNull();
  });

  it('round-trips the image with the geometry it was rendered for', () => {
    saveCachedBasemap(ENTRY);
    expect(loadCachedBasemap()).toEqual(ENTRY);
  });

  /** A truncated or foreign value must not be drawn as if it were a map. */
  it('rejects a stored value that is not a PNG data URL', () => {
    localStorage.setItem(
      'fs-basemap-last-v1',
      JSON.stringify({ dataUrl: 'https://example.com/x.png', request: REQUEST }),
    );
    expect(loadCachedBasemap()).toBeNull();
  });

  it('rejects an image with no geometry to place it by', () => {
    localStorage.setItem('fs-basemap-last-v1', JSON.stringify({ dataUrl: ENTRY.dataUrl }));
    expect(loadCachedBasemap()).toBeNull();
  });

  it('survives a corrupted store rather than breaking the map', () => {
    localStorage.setItem('fs-basemap-last-v1', '{not json');
    expect(loadCachedBasemap()).toBeNull();
  });

  it('treats a refused write as losing only the next head start', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => saveCachedBasemap(ENTRY)).not.toThrow();
  });
});
