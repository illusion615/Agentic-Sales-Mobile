/**
 * Coordinate datums.
 *
 * Work orders carry WGS-84 positions, the datum GPS and international map
 * services use. Chinese map services publish their imagery in GCJ-02, which is
 * deliberately offset from WGS-84 by several hundred metres. Drawing WGS-84
 * pins over a GCJ-02 basemap therefore puts every job on the wrong street, so
 * the whole view is projected in whichever datum the active basemap uses.
 *
 * The conversion is the published GCJ-02 obfuscation, applied only inside the
 * area where it is defined.
 */
import type { GeoPoint } from '@/domain/work-order';

export type GeoDatum = 'wgs84' | 'gcj02';

const KRASOVSKY_SEMI_MAJOR_AXIS = 6378245.0;
const KRASOVSKY_ECCENTRICITY_SQUARED = 0.00669342162296594323;

/** Outside this envelope GCJ-02 is undefined and coordinates pass through. */
export function isInsideChina(point: GeoPoint): boolean {
  return (
    point.longitude > 73.66 &&
    point.longitude < 135.05 &&
    point.latitude > 3.86 &&
    point.latitude < 53.55
  );
}

function transformLatitude(x: number, y: number): number {
  let value =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  value += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  value +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return value;
}

function transformLongitude(x: number, y: number): number {
  let value = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  value += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  value +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return value;
}

export function wgs84ToGcj02(point: GeoPoint): GeoPoint {
  if (!isInsideChina(point)) return point;

  const x = point.longitude - 105.0;
  const y = point.latitude - 35.0;
  let deltaLatitude = transformLatitude(x, y);
  let deltaLongitude = transformLongitude(x, y);

  const radLatitude = (point.latitude / 180.0) * Math.PI;
  let magic = Math.sin(radLatitude);
  magic = 1 - KRASOVSKY_ECCENTRICITY_SQUARED * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  deltaLatitude =
    (deltaLatitude * 180.0) /
    (((KRASOVSKY_SEMI_MAJOR_AXIS * (1 - KRASOVSKY_ECCENTRICITY_SQUARED)) / (magic * sqrtMagic)) *
      Math.PI);
  deltaLongitude =
    (deltaLongitude * 180.0) /
    ((KRASOVSKY_SEMI_MAJOR_AXIS / sqrtMagic) * Math.cos(radLatitude) * Math.PI);

  return {
    latitude: point.latitude + deltaLatitude,
    longitude: point.longitude + deltaLongitude,
  };
}

/**
 * Invert the obfuscation iteratively. The common one-step approximation can be
 * several metres off; map pins need sub-metre round-trip accuracy.
 */
export function gcj02ToWgs84(point: GeoPoint): GeoPoint {
  if (!isInsideChina(point)) return point;

  let estimate = { ...point };
  for (let iteration = 0; iteration < 12; iteration++) {
    const projected = wgs84ToGcj02(estimate);
    const latitudeError = point.latitude - projected.latitude;
    const longitudeError = point.longitude - projected.longitude;
    estimate = {
      latitude: estimate.latitude + latitudeError,
      longitude: estimate.longitude + longitudeError,
    };
    if (Math.abs(latitudeError) < 1e-8 && Math.abs(longitudeError) < 1e-8) break;
  }
  return estimate;
}

/** Convert a stored WGS-84 position into the datum a basemap is drawn in. */
export function toDatum(point: GeoPoint, datum: GeoDatum): GeoPoint {
  return datum === 'gcj02' ? wgs84ToGcj02(point) : point;
}

/**
 * Convert between datums explicitly. Needed for data that does not arrive in
 * WGS-84 — route geometry from a Chinese map service is already GCJ-02 and must
 * never be shifted a second time.
 */
export function convertDatum(point: GeoPoint, from: GeoDatum, to: GeoDatum): GeoPoint {
  if (from === to) return point;
  return from === 'wgs84' ? wgs84ToGcj02(point) : gcj02ToWgs84(point);
}
