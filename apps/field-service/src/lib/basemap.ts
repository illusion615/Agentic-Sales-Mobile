/**
 * Street basemap configuration.
 *
 * A street basemap is what makes the work map worth reading, so the app always
 * tries to show one — in development and in a hosted environment alike. Because
 * any single tile service can be blocked, throttled or unreachable from a given
 * network, several sources are attempted in order, and the app's own coordinate
 * grid is used only after every one of them has failed.
 *
 * `VITE_MAP_TILE_URL` pins one specific service, for customers with a licensed
 * or self-hosted basemap. An empty string turns tiles off entirely.
 */
import type { GeoDatum } from './geo-datum';

export interface Basemap {
  id: string;
  template: string;
  attribution: string;
  /** Chinese services publish GCJ-02 imagery; pins must be projected to match. */
  datum: GeoDatum;
}

/** Tried in order; the first source whose tiles actually render is kept. */
const BASEMAP_PROVIDERS: readonly Basemap[] = [
  {
    id: 'carto-voyager',
    template: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap · © CARTO',
    datum: 'wgs84',
  },
  {
    id: 'osm',
    template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    datum: 'wgs84',
  },
  {
    id: 'esri-street',
    template:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    datum: 'wgs84',
  },
];

export interface BasemapEnvironment {
  configuredUrl?: string;
  configuredAttribution?: string;
  configuredDatum?: string;
}

export function resolveBasemaps(environment: BasemapEnvironment = {}): readonly Basemap[] {
  if (environment.configuredUrl === undefined) return BASEMAP_PROVIDERS;

  const template = environment.configuredUrl.trim();
  if (template === '') return [];
  return [
    {
      id: 'configured',
      template,
      attribution: environment.configuredAttribution?.trim() ?? '',
      datum: environment.configuredDatum?.trim() === 'gcj02' ? 'gcj02' : 'wgs84',
    },
  ];
}

export function configuredBasemaps(): readonly Basemap[] {
  return resolveBasemaps({
    configuredUrl: import.meta.env.VITE_MAP_TILE_URL,
    configuredAttribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION,
    configuredDatum: import.meta.env.VITE_MAP_TILE_DATUM,
  });
}

export function tileUrl(template: string, tile: { x: number; y: number; z: number }): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
}
