/**
 * Road route geometry.
 *
 * The map service returns a driving route as a semicolon-separated list of
 * `lng,lat` pairs in GCJ-02. This module turns that into points the map can
 * draw and nothing else: it holds no opinion about which route to take, and it
 * never fabricates geometry — an unavailable leg produces no line rather than a
 * straight one, because a straight line between two stops is a lie about the
 * road network.
 */
import type { GeoPoint } from '@/domain/work-order';
import { convertDatum, type GeoDatum } from './geo-datum';
import { toScreen, type MapView, type ViewportSize } from './map-projection';

/** The datum every Chinese map service publishes route geometry in. */
export const ROUTE_DATUM: GeoDatum = 'gcj02';

export interface RouteLeg {
  /** Road distance in metres. */
  distanceMetres: number;
  /** Traffic-aware driving time in seconds. */
  durationSeconds: number;
  trafficLights: number;
  /** Route shape in GCJ-02, as published. */
  points: GeoPoint[];
}

/** Stable identity for a leg, so an unchanged leg is never re-fetched. */
export function legKey(from: GeoPoint, to: GeoPoint): string {
  return `${coordinate(from)}>${coordinate(to)}`;
}

/** AMap accepts six decimal places; more is noise and defeats caching. */
export function coordinate(point: GeoPoint): string {
  return `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
}

export function parsePolyline(value: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (const pair of value.split(';')) {
    const [longitude, latitude] = pair.split(',').map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    points.push({ latitude, longitude });
  }
  return points;
}

/**
 * SVG path for a route, projected into the basemap's datum.
 *
 * Returns null below two points: a one-point route has no shape to draw.
 */
export function routePath(
  points: readonly GeoPoint[],
  view: MapView,
  size: ViewportSize,
  datum: GeoDatum,
): string | null {
  if (points.length < 2) return null;

  let path = '';
  for (const point of points) {
    const at = toScreen(convertDatum(point, ROUTE_DATUM, datum), view, size);
    path += `${path === '' ? 'M' : 'L'}${at.x.toFixed(1)} ${at.y.toFixed(1)}`;
  }
  return path;
}

/** Where to hang a leg's travel-time label: the middle of its geometry. */
export function routeMidpoint(points: readonly GeoPoint[]): GeoPoint | null {
  if (points.length === 0) return null;
  return points[Math.floor(points.length / 2)];
}

/**
 * The stop each leg arrives at.
 *
 * Legs are the gaps in `[origin?, ...stops]`, so the destination index shifts
 * by one when no origin is known. Deriving it rather than assuming it keeps a
 * leg's label and colour attached to the right job.
 */
export function legDestinations<T>(stops: readonly T[], hasOrigin: boolean): T[] {
  return hasOrigin ? [...stops] : stops.slice(1);
}
