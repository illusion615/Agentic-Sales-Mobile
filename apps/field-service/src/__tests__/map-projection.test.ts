import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitPoints,
  fromScreen,
  panView,
  project,
  scaleBar,
  tileGrid,
  toScreen,
  unproject,
  zoomAround,
  zoomView,
  type MapView,
  type ViewportSize,
} from '@/lib/map-projection';
import type { GeoPoint } from '@/domain/work-order';

const SIZE: ViewportSize = { width: 360, height: 420 };

const SHENZHEN: GeoPoint = { latitude: 22.5431, longitude: 114.0579 };
const NANSHAN: GeoPoint = { latitude: 22.5333, longitude: 113.9301 };
const FUTIAN: GeoPoint = { latitude: 22.5486, longitude: 114.0895 };

const closeTo = (actual: number, expected: number, tolerance = 1e-6) =>
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);

describe('project / unproject', () => {
  it('round-trips a coordinate through world pixels', () => {
    const restored = unproject(project(SHENZHEN, 14), 14);
    closeTo(restored.latitude, SHENZHEN.latitude);
    closeTo(restored.longitude, SHENZHEN.longitude);
  });

  it('places the antimeridian and equator at the world centre', () => {
    const origin = project({ latitude: 0, longitude: 0 }, 0);
    closeTo(origin.x, 128);
    closeTo(origin.y, 128);
  });

  it('grows north-south with latitude, as Mercator requires', () => {
    const north = project({ latitude: 60, longitude: 0 }, 0).y;
    const equator = project({ latitude: 0, longitude: 0 }, 0).y;
    expect(north).toBeLessThan(equator);
  });
});

describe('toScreen / fromScreen', () => {
  const view: MapView = { center: SHENZHEN, zoom: 12 };

  it('puts the view centre in the middle of the viewport', () => {
    const pixel = toScreen(SHENZHEN, view, SIZE);
    closeTo(pixel.x, SIZE.width / 2, 1e-9);
    closeTo(pixel.y, SIZE.height / 2, 1e-9);
  });

  it('is the inverse of reading a coordinate back off the screen', () => {
    const restored = fromScreen(toScreen(FUTIAN, view, SIZE), view, SIZE);
    closeTo(restored.latitude, FUTIAN.latitude);
    closeTo(restored.longitude, FUTIAN.longitude);
  });
});

describe('panView', () => {
  it('moves content with the finger', () => {
    const view: MapView = { center: SHENZHEN, zoom: 12 };
    const before = toScreen(FUTIAN, view, SIZE);
    const after = toScreen(FUTIAN, panView(view, 40, -25), SIZE);
    closeTo(after.x - before.x, 40, 1e-6);
    closeTo(after.y - before.y, -25, 1e-6);
  });
});

describe('zoomView', () => {
  it('clamps to the supported range instead of running off the scale', () => {
    expect(zoomView({ center: SHENZHEN, zoom: MAX_ZOOM }, 3).zoom).toBe(MAX_ZOOM);
    expect(zoomView({ center: SHENZHEN, zoom: MIN_ZOOM }, -3).zoom).toBe(MIN_ZOOM);
  });
});

describe('zoomAround', () => {
  it('keeps the anchored point under the same pixel', () => {
    const view: MapView = { center: SHENZHEN, zoom: 12 };
    const anchor = { x: 90, y: 300 };
    const target = fromScreen(anchor, view, SIZE);

    const after = toScreen(target, zoomAround(view, 1, anchor, SIZE), SIZE);
    closeTo(after.x, anchor.x, 1e-6);
    closeTo(after.y, anchor.y, 1e-6);
  });
});

describe('fitPoints', () => {
  it('frames every point inside the padded viewport', () => {
    const points = [SHENZHEN, NANSHAN, FUTIAN];
    const padding = 48;
    const view = fitPoints(points, SIZE, { padding });

    for (const point of points) {
      const pixel = toScreen(point, view, SIZE);
      expect(pixel.x).toBeGreaterThanOrEqual(padding - 1);
      expect(pixel.x).toBeLessThanOrEqual(SIZE.width - padding + 1);
      expect(pixel.y).toBeGreaterThanOrEqual(padding - 1);
      expect(pixel.y).toBeLessThanOrEqual(SIZE.height - padding + 1);
    }
  });

  it('falls back to a readable zoom for a single point rather than zooming to infinity', () => {
    const view = fitPoints([SHENZHEN], SIZE, { fallbackZoom: 15 });
    expect(view.zoom).toBe(15);
    closeTo(view.center.latitude, SHENZHEN.latitude, 1e-9);
  });

  it('never zooms past the requested ceiling for a tight cluster', () => {
    const tight = [SHENZHEN, { latitude: 22.5432, longitude: 114.058 }];
    expect(fitPoints(tight, SIZE, { maxZoom: 16 }).zoom).toBe(16);
  });

  it('uses the fallback centre when there is nothing to frame', () => {
    const view = fitPoints([], SIZE, { fallbackCenter: SHENZHEN, fallbackZoom: 13 });
    expect(view).toEqual({ center: SHENZHEN, zoom: 13 });
  });
});

describe('tileGrid', () => {
  const view: MapView = { center: SHENZHEN, zoom: 12.4 };

  it('covers the whole viewport', () => {
    const tiles = tileGrid(view, SIZE);
    expect(tiles.length).toBeGreaterThan(0);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(SIZE.width);
    expect(Math.max(...tiles.map((t) => t.top + t.size))).toBeGreaterThanOrEqual(SIZE.height);
  });

  it('requests only tile indices that exist at that zoom', () => {
    const tiles = tileGrid(view, SIZE);
    const limit = 2 ** tiles[0].z;
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(limit);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(limit);
    }
  });

  it('asks for nothing before the viewport has been measured', () => {
    expect(tileGrid(view, { width: 0, height: 0 })).toEqual([]);
  });
});

describe('scaleBar', () => {
  it('picks a round distance that fits the allowed width', () => {
    const bar = scaleBar({ center: SHENZHEN, zoom: 13 }, 120);
    expect(bar.width).toBeLessThanOrEqual(120);
    expect([10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000]).toContain(bar.metres);
  });
});
