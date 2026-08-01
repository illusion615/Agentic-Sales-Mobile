/**
 * Static basemap requests.
 *
 * The hosted app cannot load tile URLs, so the basemap arrives as one image per
 * view, fetched through a connector. Everything here is pure geometry: which
 * image to ask for, and where to draw the one that came back.
 *
 * The service only renders integer zoom levels, while the view zooms smoothly.
 * An image is therefore requested at the nearest integer zoom and drawn scaled
 * by the remaining fraction, so it stays registered with the pins during a
 * pinch instead of jumping between levels.
 */
import type { GeoPoint } from '@/domain/work-order';
import { project, type MapView, type ViewportSize } from './map-projection';

export const STATIC_MAP_MAX_EDGE_PX = 1024;
export const STATIC_MAP_MIN_ZOOM = 3;
export const STATIC_MAP_MAX_ZOOM = 17;
/** AMap static zoom 12 was pixel-calibrated to Web Mercator zoom 13. */
export const AMAP_WEB_MERCATOR_ZOOM_OFFSET = 1;

export interface StaticMapRequest {
  /** Centre in the basemap's own datum. */
  center: GeoPoint;
  /** Zoom sent to AMap. */
  serviceZoom: number;
  /** Equivalent zoom in the app's Web Mercator projection. */
  projectionZoom: number;
  widthPx: number;
  heightPx: number;
  /** 2 renders at double density for high-DPI screens. */
  scale: 1 | 2;
  /** Live traffic is an information layer the technician opts into. */
  traffic: boolean;
}

export interface StaticMapLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clampZoom(zoom: number): number {
  return Math.max(STATIC_MAP_MIN_ZOOM, Math.min(STATIC_MAP_MAX_ZOOM, Math.round(zoom)));
}

export function amapProjectionZoom(serviceZoom: number): number {
  return serviceZoom + AMAP_WEB_MERCATOR_ZOOM_OFFSET;
}

export function staticMapRequestFor(
  view: MapView,
  size: ViewportSize,
  devicePixelRatio = 1,
  traffic = false,
): StaticMapRequest | null {
  if (size.width <= 0 || size.height <= 0) return null;

  const projectionZoom = Math.max(
    STATIC_MAP_MIN_ZOOM + AMAP_WEB_MERCATOR_ZOOM_OFFSET,
    Math.min(STATIC_MAP_MAX_ZOOM + AMAP_WEB_MERCATOR_ZOOM_OFFSET, Math.round(view.zoom)),
  );
  const serviceZoom = clampZoom(projectionZoom - AMAP_WEB_MERCATOR_ZOOM_OFFSET);
  return {
    center: view.center,
    serviceZoom,
    projectionZoom: amapProjectionZoom(serviceZoom),
    widthPx: Math.min(STATIC_MAP_MAX_EDGE_PX, Math.ceil(size.width)),
    heightPx: Math.min(STATIC_MAP_MAX_EDGE_PX, Math.ceil(size.height)),
    scale: devicePixelRatio > 1 ? 2 : 1,
    traffic,
  };
}

/**
 * Request one complete view at a lower raster resolution. One image avoids the
 * roads, labels and copyright seams created when a static-map service renders
 * independent cells; JavaScript decodes it and Canvas scales it into place.
 */
export function staticMapCanvasRequests(
  view: MapView,
  size: ViewportSize,
  traffic = false,
): StaticMapRequest[] {
  if (size.width <= 0 || size.height <= 0) return [];

  const projectionZoom = Math.max(
    STATIC_MAP_MIN_ZOOM + AMAP_WEB_MERCATOR_ZOOM_OFFSET,
    Math.min(STATIC_MAP_MAX_ZOOM + AMAP_WEB_MERCATOR_ZOOM_OFFSET, Math.floor(view.zoom)),
  );
  const serviceZoom = clampZoom(projectionZoom - AMAP_WEB_MERCATOR_ZOOM_OFFSET);
  const effectiveProjectionZoom = amapProjectionZoom(serviceZoom);
  const displayScale = 2 ** (view.zoom - effectiveProjectionZoom);
  const requestWidth = Math.ceil(size.width / displayScale);
  const requestHeight = Math.ceil(size.height / displayScale);
  return [
    {
      center: view.center,
      serviceZoom,
      projectionZoom: effectiveProjectionZoom,
      widthPx: Math.min(STATIC_MAP_MAX_EDGE_PX, requestWidth),
      heightPx: Math.min(STATIC_MAP_MAX_EDGE_PX, requestHeight),
      scale: 1,
      traffic,
    },
  ];
}

/**
 * Where to draw an image that was rendered for `request` inside the current
 * view. Keeps the image anchored to its own centre coordinate, so a view that
 * has since been panned or zoomed still lines up until the next image arrives.
 */
export function staticMapLayout(
  request: StaticMapRequest,
  view: MapView,
  size: ViewportSize,
): StaticMapLayout {
  const scale = 2 ** (view.zoom - request.projectionZoom);
  const width = request.widthPx * scale;
  const height = request.heightPx * scale;

  const centerWorld = project(view.center, view.zoom);
  const imageWorld = project(request.center, view.zoom);

  return {
    left: size.width / 2 + (imageWorld.x - centerWorld.x) - width / 2,
    top: size.height / 2 + (imageWorld.y - centerWorld.y) - height / 2,
    width,
    height,
  };
}

/** Identity of a request, so an unchanged view is never fetched twice. */
export function staticMapKey(request: StaticMapRequest): string {
  return [
    request.center.latitude.toFixed(5),
    request.center.longitude.toFixed(5),
    request.serviceZoom,
    request.projectionZoom,
    request.widthPx,
    request.heightPx,
    request.scale,
    request.traffic ? 'traffic' : 'plain',
  ].join('/');
}

export interface AMapStaticParams {
  location: string;
  zoom: number;
  size: string;
  scale: number;
  traffic: number;
}

export function amapStaticParams(request: StaticMapRequest): AMapStaticParams {
  return {
    location: `${request.center.longitude.toFixed(6)},${request.center.latitude.toFixed(6)}`,
    zoom: request.serviceZoom,
    size: `${request.widthPx}*${request.heightPx}`,
    scale: request.scale,
    traffic: request.traffic ? 1 : 0,
  };
}

export type ImagePayloadEncoding =
  | 'data-url'
  | 'base64'
  | 'base64url'
  | 'json-base64'
  | 'powerfx-binary'
  | 'json-string'
  | 'binary-string'
  | 'array-buffer'
  | 'typed-array'
  | 'unknown';

export interface NormalizedImagePayload {
  dataUrl: string | null;
  encoding: ImagePayloadEncoding;
  length: number;
}

export function imagePayloadFingerprint(payload: unknown): string {
  if (typeof payload === 'string') {
    const codes = [...payload.slice(0, 12)]
      .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(' ');
    return `string:${payload.length} [${codes}]`;
  }
  if (payload instanceof ArrayBuffer) {
    return `ArrayBuffer:${payload.byteLength}`;
  }
  if (ArrayBuffer.isView(payload)) {
    return `${payload.constructor.name}:${payload.byteLength}`;
  }
  return `${typeof payload}`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function hasPngSignature(bytes: ArrayLike<number>): boolean {
  return PNG_SIGNATURE.every((expected, index) => bytes[index] === expected);
}

function binaryStringHasPngSignature(value: string): boolean {
  return PNG_SIGNATURE.every((expected, index) => value.charCodeAt(index) === expected);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64HasPngSignature(value: string): boolean {
  try {
    const prefix = atob(value.slice(0, 16));
    return binaryStringHasPngSignature(prefix);
  } catch {
    return false;
  }
}

function normalizeBase64Padding(value: string): string {
  return value.padEnd(Math.ceil(value.length / 4) * 4, '=');
}

/**
 * Native App Player can return an image ArrayBuffer as a byte-valued JS string
 * instead of the base64 string returned in browsers. Detect the PNG signature
 * before deciding whether another base64 encoding pass is required.
 */
export function normalizeImagePayload(payload: unknown): NormalizedImagePayload {
  if (typeof payload === 'string') {
    if (payload.startsWith('data:image/')) {
      return { dataUrl: payload, encoding: 'data-url', length: payload.length };
    }
    if (payload.length === 0) return { dataUrl: null, encoding: 'unknown', length: 0 };

    if (payload.startsWith("binary'") && payload.endsWith("'")) {
      const binaryLiteral = payload.slice(7, -1).replace(/''/g, "'");
      const nested = normalizeImagePayload(binaryLiteral);
      return {
        dataUrl: nested.dataUrl,
        encoding: 'powerfx-binary',
        length: payload.length,
      };
    }

    if (payload.startsWith('"') && payload.endsWith('"')) {
      try {
        const decoded: unknown = JSON.parse(payload);
        if (typeof decoded === 'string') {
          const nested = normalizeImagePayload(decoded);
          return { dataUrl: nested.dataUrl, encoding: 'json-string', length: payload.length };
        }
      } catch {
        // Continue through the ordinary format checks.
      }
    }

    if (binaryStringHasPngSignature(payload)) {
      try {
        return {
          dataUrl: `data:image/png;base64,${btoa(payload)}`,
          encoding: 'binary-string',
          length: payload.length,
        };
      } catch {
        return { dataUrl: null, encoding: 'binary-string', length: payload.length };
      }
    }

    const compact = payload.replace(/\s/g, '');
    const usesUrlAlphabet = /[-_]/.test(compact);
    const paddedBase64 = normalizeBase64Padding(compact);
    if (!usesUrlAlphabet && base64HasPngSignature(paddedBase64)) {
      return {
        dataUrl: `data:image/png;base64,${paddedBase64}`,
        encoding: 'base64',
        length: payload.length,
      };
    }

    const base64url = normalizeBase64Padding(compact.replace(/-/g, '+').replace(/_/g, '/'));
    if (usesUrlAlphabet && base64HasPngSignature(base64url)) {
      return {
        dataUrl: `data:image/png;base64,${base64url}`,
        encoding: 'base64url',
        length: payload.length,
      };
    }
    return { dataUrl: null, encoding: 'unknown', length: payload.length };
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'imageBase64' in payload &&
    typeof payload.imageBase64 === 'string'
  ) {
    const nested = normalizeImagePayload(payload.imageBase64);
    return {
      dataUrl: nested.dataUrl,
      encoding: 'json-base64',
      length: payload.imageBase64.length,
    };
  }

  if (payload instanceof ArrayBuffer) {
    const bytes = new Uint8Array(payload);
    return {
      dataUrl: hasPngSignature(bytes) ? `data:image/png;base64,${bytesToBase64(bytes)}` : null,
      encoding: 'array-buffer',
      length: bytes.length,
    };
  }

  if (ArrayBuffer.isView(payload)) {
    const bytes = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    return {
      dataUrl: hasPngSignature(bytes) ? `data:image/png;base64,${bytesToBase64(bytes)}` : null,
      encoding: 'typed-array',
      length: bytes.length,
    };
  }

  return { dataUrl: null, encoding: 'unknown', length: 0 };
}

/** Backwards-compatible convenience for consumers that only need the URL. */
export function toImageDataUrl(payload: unknown): string | null {
  return normalizeImagePayload(payload).dataUrl;
}
