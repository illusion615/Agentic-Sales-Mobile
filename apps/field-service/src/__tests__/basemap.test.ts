import { describe, expect, it } from 'vitest';
import { resolveBasemaps, tileUrl } from '@/lib/basemap';

describe('resolveBasemaps', () => {
  it('offers several sources so one blocked service cannot remove the map', () => {
    const providers = resolveBasemaps();
    expect(providers.length).toBeGreaterThan(1);
    expect(new Set(providers.map((p) => p.id)).size).toBe(providers.length);
    for (const provider of providers) {
      expect(provider.template).toContain('{z}');
      expect(provider.template).toContain('{x}');
      expect(provider.template).toContain('{y}');
      expect(provider.attribution).not.toBe('');
    }
  });

  it('uses only the pinned service when a deployment configures one', () => {
    expect(
      resolveBasemaps({
        configuredUrl: ' https://maps.example/{z}/{x}/{y}.png ',
        configuredAttribution: ' Licensed map ',
      }),
    ).toEqual([
      {
        id: 'configured',
        template: 'https://maps.example/{z}/{x}/{y}.png',
        attribution: 'Licensed map',
        datum: 'wgs84',
      },
    ]);
  });

  it('carries a Chinese service datum through, so pins are projected to match', () => {
    expect(
      resolveBasemaps({ configuredUrl: 'https://maps.example/{z}/{x}/{y}.png', configuredDatum: 'gcj02' })[0]
        .datum,
    ).toBe('gcj02');
  });

  it('treats an explicit empty value as "no tiles"', () => {
    expect(resolveBasemaps({ configuredUrl: ' ' })).toEqual([]);
  });
});

describe('tileUrl', () => {
  it('fills every tile coordinate placeholder', () => {
    expect(tileUrl('https://maps.example/{z}/{x}/{y}.png', { z: 12, x: 3345, y: 1776 })).toBe(
      'https://maps.example/12/3345/1776.png',
    );
  });

  it('respects a service whose path orders the axes differently', () => {
    expect(tileUrl('https://maps.example/{z}/{y}/{x}', { z: 12, x: 3345, y: 1776 })).toBe(
      'https://maps.example/12/1776/3345',
    );
  });
});
