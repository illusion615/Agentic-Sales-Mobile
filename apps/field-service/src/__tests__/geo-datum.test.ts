import { describe, expect, it } from 'vitest';
import { gcj02ToWgs84, isInsideChina, toDatum, wgs84ToGcj02 } from '@/lib/geo-datum';
import { distanceKm } from '@/domain/scheduling';

const TIANANMEN = { latitude: 39.90864, longitude: 116.39745 };
const SHENZHEN = { latitude: 22.5431, longitude: 114.0579 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };

describe('wgs84ToGcj02', () => {
  it('reproduces the published GCJ-02 position of a known landmark', () => {
    const shifted = wgs84ToGcj02(TIANANMEN);
    expect(shifted.latitude).toBeCloseTo(39.91009, 3);
    expect(shifted.longitude).toBeCloseTo(116.40365, 3);
  });

  it('shifts a Chinese position by the few hundred metres the datum differs by', () => {
    const shifted = wgs84ToGcj02(TIANANMEN);
    const metres = distanceKm(TIANANMEN, shifted) * 1000;
    expect(metres).toBeGreaterThan(100);
    expect(metres).toBeLessThan(1000);
  });

  it('displaces the service area enough to matter on screen', () => {
    const shifted = wgs84ToGcj02(SHENZHEN);
    const metres = distanceKm(SHENZHEN, shifted) * 1000;
    expect(metres).toBeGreaterThan(100);
    expect(metres).toBeLessThan(1000);
  });

  it('leaves positions outside China untouched, where the datum is undefined', () => {
    expect(wgs84ToGcj02(LONDON)).toEqual(LONDON);
  });

  it('is stable, so repeated projection of the same job never drifts', () => {
    expect(wgs84ToGcj02(SHENZHEN)).toEqual(wgs84ToGcj02(SHENZHEN));
  });
});

describe('isInsideChina', () => {
  it('accepts the service area and rejects a foreign one', () => {
    expect(isInsideChina(SHENZHEN)).toBe(true);
    expect(isInsideChina(LONDON)).toBe(false);
  });
});

describe('gcj02ToWgs84', () => {
  it('round-trips a Shenzhen POI to sub-metre accuracy', () => {
    const gcj = { latitude: 22.530603, longitude: 113.922873 };
    const restored = wgs84ToGcj02(gcj02ToWgs84(gcj));
    expect(distanceKm(gcj, restored) * 1000).toBeLessThan(1);
  });

  it('leaves a foreign coordinate unchanged', () => {
    expect(gcj02ToWgs84(LONDON)).toEqual(LONDON);
  });
});

describe('toDatum', () => {
  it('passes coordinates through for a WGS-84 basemap', () => {
    expect(toDatum(SHENZHEN, 'wgs84')).toEqual(SHENZHEN);
  });

  it('converts for a GCJ-02 basemap so pins land on the right street', () => {
    expect(toDatum(SHENZHEN, 'gcj02')).toEqual(wgs84ToGcj02(SHENZHEN));
  });
});
