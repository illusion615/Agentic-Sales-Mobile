import { describe, expect, it } from 'vitest';
import { isLocalPreview, preferConnectorBasemap } from '@/lib/map-runtime';

describe('map runtime transport', () => {
  it('keeps public tiles for local development', () => {
    expect(isLocalPreview({ hostname: 'localhost' })).toBe(true);
    expect(preferConnectorBasemap({ hostname: '127.0.0.1' })).toBe(false);
  });

  it('uses the connector in hosted Edge for parity with the mobile player', () => {
    expect(preferConnectorBasemap({ hostname: 'apps.powerapps.com' })).toBe(true);
  });

  it('uses the connector inside a storageproxy/app-player host', () => {
    expect(preferConnectorBasemap({ hostname: 'pa-static-ms.azureedge.net' })).toBe(true);
  });

  it('fails closed to the connector when no location is available', () => {
    expect(preferConnectorBasemap(null)).toBe(true);
  });
});
