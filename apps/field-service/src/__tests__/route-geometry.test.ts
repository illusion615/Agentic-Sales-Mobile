import { describe, expect, it } from 'vitest';
import {
  coordinate,
  legDestinations,
  legKey,
  parsePolyline,
  routeMidpoint,
  routePath,
  ROUTE_DATUM,
} from '@/lib/route-geometry';
import { wgs84ToGcj02 } from '@/lib/geo-datum';
import { toScreen, type MapView, type ViewportSize } from '@/lib/map-projection';

const VIEW: MapView = { center: { latitude: 22.5455, longitude: 114.0637 }, zoom: 13 };
const SIZE: ViewportSize = { width: 400, height: 400 };

describe('parsePolyline', () => {
  it('reads longitude-first pairs as published', () => {
    expect(parsePolyline('114.063696,22.54565;114.063448,22.545645')).toEqual([
      { longitude: 114.063696, latitude: 22.54565 },
      { longitude: 114.063448, latitude: 22.545645 },
    ]);
  });

  it('drops malformed pairs rather than emitting NaN coordinates', () => {
    expect(parsePolyline('114.06,22.54;;broken;114.07,22.55')).toEqual([
      { longitude: 114.06, latitude: 22.54 },
      { longitude: 114.07, latitude: 22.55 },
    ]);
  });

  it('yields nothing for an empty polyline', () => {
    expect(parsePolyline('')).toEqual([]);
  });
});

describe('routePath', () => {
  it('draws nothing from fewer than two points', () => {
    expect(routePath([], VIEW, SIZE, ROUTE_DATUM)).toBeNull();
    expect(routePath([{ latitude: 22.5, longitude: 114 }], VIEW, SIZE, ROUTE_DATUM)).toBeNull();
  });

  it('leaves route geometry untouched on a GCJ-02 basemap', () => {
    const points = parsePolyline('114.0637,22.5455;114.0737,22.5555');
    const path = routePath(points, VIEW, SIZE, 'gcj02');
    const expected = toScreen(points[0], VIEW, SIZE);

    expect(path).toContain(`M${expected.x.toFixed(1)} ${expected.y.toFixed(1)}`);
  });

  it('shifts route geometry back to WGS-84 for an international basemap', () => {
    const points = parsePolyline('114.0637,22.5455;114.0737,22.5555');
    const gcj = routePath(points, VIEW, SIZE, 'gcj02');
    const wgs = routePath(points, VIEW, SIZE, 'wgs84');

    // The datums differ by hundreds of metres; the drawn line must differ too.
    expect(wgs).not.toEqual(gcj);
  });
});

describe('legKey', () => {
  it('is stable for the same pair and distinct for a reversed one', () => {
    const a = { latitude: 22.5455, longitude: 114.0637 };
    const b = { latitude: 22.5379, longitude: 114.1222 };

    expect(legKey(a, b)).toBe(legKey({ ...a }, { ...b }));
    expect(legKey(a, b)).not.toBe(legKey(b, a));
  });

  it('formats coordinates longitude-first, as the map service expects', () => {
    expect(coordinate(wgs84ToGcj02({ latitude: 22.5455, longitude: 114.0637 }))).toMatch(
      /^114\.\d{6},22\.\d{6}$/,
    );
  });
});

describe('routeMidpoint', () => {
  it('picks a point on the route for the travel-time label', () => {
    const points = parsePolyline('114.06,22.54;114.07,22.55;114.08,22.56');
    expect(routeMidpoint(points)).toEqual({ longitude: 114.07, latitude: 22.55 });
  });

  it('has nowhere to hang a label on an empty route', () => {
    expect(routeMidpoint([])).toBeNull();
  });
});

describe('legDestinations', () => {
  const stops = ['a', 'b', 'c'];

  it('names every stop when the technician has a known starting point', () => {
    expect(legDestinations(stops, true)).toEqual(['a', 'b', 'c']);
  });

  /** Without an origin the first leg starts at the first stop, not at the van. */
  it('drops the first stop when there is nowhere to leave from', () => {
    expect(legDestinations(stops, false)).toEqual(['b', 'c']);
  });

  it('yields exactly one destination per gap', () => {
    expect(legDestinations(stops, true)).toHaveLength(stops.length);
    expect(legDestinations(stops, false)).toHaveLength(stops.length - 1);
  });

  it('has no leg to name for a lone stop without an origin', () => {
    expect(legDestinations(['only'], false)).toEqual([]);
  });
});
