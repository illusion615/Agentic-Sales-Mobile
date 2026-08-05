/**
 * Web Mercator projection and viewport maths for the work-order map.
 *
 * Deliberately written without a map library. The app is destined for a Power
 * Apps host whose CSP blocks direct network calls, so the map must be able to
 * work from nothing but the coordinates the app already holds, and treat a
 * street basemap as an enhancement that may never load. Keeping the geometry
 * pure also means the fit, the pan and the tile grid are testable without a DOM.
 */
import type { GeoPoint } from '@/domain/work-order';

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;

/** Beyond this latitude Mercator diverges; every map clamps at the same value. */
const MAX_LATITUDE = 85.05112878;

/** Metres per pixel at zoom 0 on the equator, the standard Mercator constant. */
const EQUATOR_METRES_PER_PIXEL = 156543.03392804097;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface MapView {
  center: GeoPoint;
  /** Fractional zoom is allowed so an overview can fit its content exactly. */
  zoom: number;
}

export interface Pixel {
  x: number;
  y: number;
}

export interface TilePlacement {
  key: string;
  /** Tile column, wrapped into the valid range for its zoom. */
  x: number;
  y: number;
  z: number;
  /** Placement in viewport pixels. */
  left: number;
  top: number;
  /** Rendered edge length, which is only 256 at integer zoom. */
  size: number;
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

/** Project to absolute world pixels at a zoom level. */
export function project(point: GeoPoint, zoom: number): Pixel {
  const size = worldSize(zoom);
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, point.latitude));
  const rad = (latitude * Math.PI) / 180;
  return {
    x: ((point.longitude + 180) / 360) * size,
    y: (0.5 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / (2 * Math.PI)) * size,
  };
}

export function unproject(pixel: Pixel, zoom: number): GeoPoint {
  const size = worldSize(zoom);
  const n = Math.PI - 2 * Math.PI * (pixel.y / size);
  return {
    latitude: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    longitude: (pixel.x / size) * 360 - 180,
  };
}

/** Where a coordinate lands inside the viewport, relative to its top-left corner. */
export function toScreen(point: GeoPoint, view: MapView, size: ViewportSize): Pixel {
  const world = project(point, view.zoom);
  const center = project(view.center, view.zoom);
  return {
    x: size.width / 2 + (world.x - center.x),
    y: size.height / 2 + (world.y - center.y),
  };
}

export function fromScreen(pixel: Pixel, view: MapView, size: ViewportSize): GeoPoint {
  const center = project(view.center, view.zoom);
  return unproject(
    {
      x: center.x + (pixel.x - size.width / 2),
      y: center.y + (pixel.y - size.height / 2),
    },
    view.zoom,
  );
}

/**
 * Drag the map by a screen delta. Content follows the finger, so the centre
 * moves the opposite way.
 */
export function panView(view: MapView, dx: number, dy: number): MapView {
  const center = project(view.center, view.zoom);
  return {
    zoom: view.zoom,
    center: unproject({ x: center.x - dx, y: center.y - dy }, view.zoom),
  };
}

/** Zoom about the centre of the viewport. */
export function zoomView(view: MapView, delta: number): MapView {
  return { center: view.center, zoom: clampZoom(view.zoom + delta) };
}

/** Zoom about a fixed screen point, so what is under the finger stays put. */
export function zoomAround(view: MapView, delta: number, anchor: Pixel, size: ViewportSize): MapView {
  const zoom = clampZoom(view.zoom + delta);
  if (zoom === view.zoom) return view;

  const target = fromScreen(anchor, view, size);
  const zoomed: MapView = { center: view.center, zoom };
  const drift = toScreen(target, zoomed, size);
  return panView(zoomed, anchor.x - drift.x, anchor.y - drift.y);
}

export interface FitOptions {
  /** Viewport pixels kept clear on every edge, so pins never touch the frame. */
  padding?: number;
  /** A cluster of nearby jobs should not zoom to street level. */
  maxZoom?: number;
  /** Used when the extent has no size — a single point, or nothing at all. */
  fallbackZoom?: number;
  fallbackCenter?: GeoPoint;
}

/**
 * Frame a set of coordinates. Returns a fractional zoom so the extent fits
 * exactly rather than to the nearest power of two.
 */
export function fitPoints(
  points: readonly GeoPoint[],
  size: ViewportSize,
  options: FitOptions = {},
): MapView {
  const padding = options.padding ?? 48;
  const maxZoom = options.maxZoom ?? 16;
  const fallbackZoom = options.fallbackZoom ?? 14;
  const fallbackCenter = options.fallbackCenter ?? { latitude: 0, longitude: 0 };

  if (points.length === 0) return { center: fallbackCenter, zoom: clampZoom(fallbackZoom) };

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  // Measured in projected space, because a latitude midpoint is not the centre
  // of a Mercator extent.
  const topLeft = project({ latitude: maxLat, longitude: minLng }, 0);
  const bottomRight = project({ latitude: minLat, longitude: maxLng }, 0);
  const center = unproject(
    { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 },
    0,
  );

  const spanX = Math.abs(bottomRight.x - topLeft.x);
  const spanY = Math.abs(bottomRight.y - topLeft.y);
  const availableWidth = Math.max(1, size.width - padding * 2);
  const availableHeight = Math.max(1, size.height - padding * 2);

  const zoomX = spanX > 0 ? Math.log2(availableWidth / spanX) : Number.POSITIVE_INFINITY;
  const zoomY = spanY > 0 ? Math.log2(availableHeight / spanY) : Number.POSITIVE_INFINITY;
  const fitted = Math.min(zoomX, zoomY);

  return {
    center,
    zoom: clampZoom(Number.isFinite(fitted) ? Math.min(fitted, maxZoom) : fallbackZoom),
  };
}

/** The basemap tiles covering the viewport, already positioned. */
export function tileGrid(view: MapView, size: ViewportSize): TilePlacement[] {
  if (size.width <= 0 || size.height <= 0) return [];

  const z = Math.max(0, Math.min(MAX_ZOOM, Math.floor(view.zoom)));
  const rendered = TILE_SIZE * 2 ** (view.zoom - z);
  const columns = 2 ** z;

  const center = project(view.center, view.zoom);
  const originX = center.x - size.width / 2;
  const originY = center.y - size.height / 2;

  const firstColumn = Math.floor(originX / rendered);
  const lastColumn = Math.floor((originX + size.width) / rendered);
  const firstRow = Math.max(0, Math.floor(originY / rendered));
  const lastRow = Math.min(columns - 1, Math.floor((originY + size.height) / rendered));

  const tiles: TilePlacement[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      // The world repeats east-west; the tile index wraps but its placement does not.
      const wrapped = ((column % columns) + columns) % columns;
      tiles.push({
        key: `${z}/${column}/${row}`,
        x: wrapped,
        y: row,
        z,
        left: column * rendered - originX,
        top: row * rendered - originY,
        size: rendered,
      });
    }
  }
  return tiles;
}

/** Ground resolution at the view centre, for the scale bar. */
export function metresPerPixel(view: MapView): number {
  return (
    (EQUATOR_METRES_PER_PIXEL * Math.cos((view.center.latitude * Math.PI) / 180)) / 2 ** view.zoom
  );
}

/** Centre a map so a requested ground distance occupies a predictable width. */
export function viewAtScale(
  center: GeoPoint,
  scaleMetres: number,
  scaleWidth = 80,
): MapView {
  const targetResolution = scaleMetres / scaleWidth;
  const latitudeResolution = EQUATOR_METRES_PER_PIXEL * Math.cos((center.latitude * Math.PI) / 180);
  return {
    center,
    zoom: clampZoom(Math.log2(latitudeResolution / targetResolution)),
  };
}

const SCALE_STEPS_METRES = [
  10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
];

/**
 * A round distance that fits within `maxWidth` pixels, with the width to draw
 * it at — the usual map scale bar.
 */
export function scaleBar(view: MapView, maxWidth: number): { metres: number; width: number } {
  const resolution = metresPerPixel(view);
  let chosen = SCALE_STEPS_METRES[0];
  for (const step of SCALE_STEPS_METRES) {
    if (step / resolution > maxWidth) break;
    chosen = step;
  }
  return { metres: chosen, width: chosen / resolution };
}
