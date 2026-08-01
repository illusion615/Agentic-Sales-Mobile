import { describe, expect, it } from 'vitest';
import {
  STATIC_MAP_MAX_EDGE_PX,
  STATIC_MAP_MAX_ZOOM,
  amapProjectionZoom,
  amapStaticParams,
  normalizeImagePayload,
  staticMapKey,
  staticMapLayout,
  staticMapCanvasRequests,
  staticMapRequestFor,
  toImageDataUrl,
} from '@/lib/static-basemap';
import { toScreen, type MapView, type ViewportSize } from '@/lib/map-projection';

const SIZE: ViewportSize = { width: 393, height: 852 };
const CENTER = { latitude: 22.5431, longitude: 114.0579 };

describe('staticMapRequestFor', () => {
  it('asks for a whole-integer zoom, which is all the service renders', () => {
    const request = staticMapRequestFor({ center: CENTER, zoom: 12.7 }, SIZE);
    expect(request?.projectionZoom).toBe(13);
    expect(request?.serviceZoom).toBe(12);
  });

  it('never exceeds the service image limit', () => {
    const request = staticMapRequestFor({ center: CENTER, zoom: 12 }, { width: 4000, height: 4000 });
    expect(request?.widthPx).toBe(STATIC_MAP_MAX_EDGE_PX);
    expect(request?.heightPx).toBe(STATIC_MAP_MAX_EDGE_PX);
  });

  it('stays inside the supported zoom range', () => {
    expect(staticMapRequestFor({ center: CENTER, zoom: 25 }, SIZE)?.serviceZoom).toBe(
      STATIC_MAP_MAX_ZOOM,
    );
  });

  it('requests double density only for a high-DPI screen', () => {
    expect(staticMapRequestFor({ center: CENTER, zoom: 12 }, SIZE, 2)?.scale).toBe(2);
    expect(staticMapRequestFor({ center: CENTER, zoom: 12 }, SIZE, 1)?.scale).toBe(1);
  });

  it('asks for nothing before the viewport has been measured', () => {
    expect(staticMapRequestFor({ center: CENTER, zoom: 12 }, { width: 0, height: 0 })).toBeNull();
  });
});

describe('staticMapLayout', () => {
  it('fills the viewport exactly when the view matches the request', () => {
    const view: MapView = { center: CENTER, zoom: 13 };
    const request = staticMapRequestFor(view, SIZE)!;
    const layout = staticMapLayout(request, view, SIZE);

    expect(layout.left).toBeCloseTo(0, 6);
    expect(layout.top).toBeCloseTo(0, 6);
    expect(layout.width).toBeCloseTo(SIZE.width, 6);
    expect(layout.height).toBeCloseTo(SIZE.height, 6);
  });

  it('keeps the image registered with its own centre after the view is panned', () => {
    const requested: MapView = { center: CENTER, zoom: 13 };
    const request = staticMapRequestFor(requested, SIZE)!;

    const panned: MapView = { center: { latitude: 22.56, longitude: 114.09 }, zoom: 13 };
    const layout = staticMapLayout(request, panned, SIZE);
    const centreOnScreen = toScreen(request.center, panned, SIZE);

    expect(layout.left + layout.width / 2).toBeCloseTo(centreOnScreen.x, 6);
    expect(layout.top + layout.height / 2).toBeCloseTo(centreOnScreen.y, 6);
  });

  it('scales the image while the view zooms between whole levels', () => {
    const request = staticMapRequestFor({ center: CENTER, zoom: 13 }, SIZE)!;
    const layout = staticMapLayout(request, { center: CENTER, zoom: 14 }, SIZE);

    expect(layout.width).toBeCloseTo(request.widthPx * 2, 6);
    expect(layout.height).toBeCloseTo(request.heightPx * 2, 6);
  });
});

describe('staticMapCanvasRequests', () => {
  it('requests one complete image so roads and labels cannot fracture between cells', () => {
    const view: MapView = { center: CENTER, zoom: 13 };
    const requests = staticMapCanvasRequests(view, SIZE);

    expect(requests).toHaveLength(1);
    for (const request of requests) {
      expect(request.scale).toBe(1);
      expect(request.serviceZoom).toBe(12);
      expect(request.projectionZoom).toBe(13);
      expect(request.center).toEqual(CENTER);
    }
  });

  it('covers the complete viewport without seams at the outer edges', () => {
    const view: MapView = { center: CENTER, zoom: 13 };
    const layouts = staticMapCanvasRequests(view, SIZE).map((request) =>
      staticMapLayout(request, view, SIZE),
    );

    const left = Math.min(...layouts.map((layout) => layout.left));
    const top = Math.min(...layouts.map((layout) => layout.top));
    const right = Math.max(...layouts.map((layout) => layout.left + layout.width));
    const bottom = Math.max(...layouts.map((layout) => layout.top + layout.height));

    expect(left).toBeLessThanOrEqual(0.5);
    expect(top).toBeLessThanOrEqual(0.5);
    expect(right).toBeGreaterThanOrEqual(SIZE.width - 0.5);
    expect(bottom).toBeGreaterThanOrEqual(SIZE.height - 0.5);
  });

  it('returns no connector calls before the map has a size', () => {
    expect(staticMapCanvasRequests({ center: CENTER, zoom: 13 }, { width: 0, height: 0 })).toEqual([]);
  });
});

describe('staticMapKey', () => {
  it('is stable for an unchanged view so no call is repeated', () => {
    const a = staticMapRequestFor({ center: CENTER, zoom: 13 }, SIZE)!;
    const b = staticMapRequestFor({ center: CENTER, zoom: 13.02 }, SIZE)!;
    expect(staticMapKey(a)).toBe(staticMapKey(b));
  });

  it('changes once the view has actually moved', () => {
    const a = staticMapRequestFor({ center: CENTER, zoom: 13 }, SIZE)!;
    const b = staticMapRequestFor({ center: { latitude: 22.6, longitude: 114.1 }, zoom: 13 }, SIZE)!;
    expect(staticMapKey(a)).not.toBe(staticMapKey(b));
  });
});

describe('amapStaticParams', () => {
  it('sends longitude before latitude, as the service expects', () => {
    const params = amapStaticParams(staticMapRequestFor({ center: CENTER, zoom: 13 }, SIZE)!);
    expect(params.location).toBe('114.057900,22.543100');
    expect(params.size).toBe('393*852');
  });
});

describe('AMap zoom calibration', () => {
  it('maps AMap service zoom 12 to Web Mercator zoom 13', () => {
    expect(amapProjectionZoom(12)).toBe(13);
  });

  it('reproduces the measured B-marker pixel from the AMap calibration image', () => {
    const centre = { latitude: 22.5455, longitude: 114.0637 };
    const marker = { latitude: 22.5573, longitude: 114.0857 };
    const screen = toScreen(marker, { center: centre, zoom: amapProjectionZoom(12) }, {
      width: 400,
      height: 400,
    });

    // AMap's marker fill measured x=319..334, y=97..120; pin tip ≈ (327,126).
    expect(screen.x).toBeCloseTo(328.16, 1);
    expect(screen.y).toBeCloseTo(125.57, 1);
  });
});

describe('toImageDataUrl', () => {
  const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];

  it('wraps returned base64 bytes for an img element', () => {
    expect(toImageDataUrl('iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('base64-encodes the byte-valued string returned by native App Player', () => {
    const binary = String.fromCharCode(...pngBytes);
    const normalized = normalizeImagePayload(binary);
    expect(normalized.encoding).toBe('binary-string');
    expect(normalized.dataUrl).toBe(`data:image/png;base64,${btoa(binary)}`);
  });

  it('unwraps a Power Fx binary literal returned by the connector gateway', () => {
    const normalized = normalizeImagePayload("binary'iVBORw0KGgo='");
    expect(normalized.encoding).toBe('powerfx-binary');
    expect(normalized.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('unwraps a JSON-encoded base64 string returned by a native bridge', () => {
    const normalized = normalizeImagePayload('"iVBORw0KGgo="');
    expect(normalized.encoding).toBe('json-string');
    expect(normalized.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('reads the connector policy JSON response without binary transport', () => {
    const normalized = normalizeImagePayload({
      imageBase64: 'iVBORw0KGgo=',
      contentType: 'image/png',
      byteLength: 8,
    });
    expect(normalized.encoding).toBe('json-base64');
    expect(normalized.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('normalizes base64url and restores omitted padding', () => {
    const standard = btoa(String.fromCharCode(...pngBytes, 0xfb, 0xff, 0xff));
    const encoded = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const normalized = normalizeImagePayload(encoded);
    expect(normalized.encoding).toBe('base64url');
    expect(normalized.dataUrl).toBe(`data:image/png;base64,${standard}`);
  });

  it('base64-encodes an ArrayBuffer response', () => {
    const normalized = normalizeImagePayload(new Uint8Array(pngBytes).buffer);
    expect(normalized.encoding).toBe('array-buffer');
    expect(normalized.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('base64-encodes a typed-array response', () => {
    const normalized = normalizeImagePayload(new Uint8Array(pngBytes));
    expect(normalized.encoding).toBe('typed-array');
    expect(normalized.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('passes an already-formed data URL through', () => {
    expect(toImageDataUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('treats an empty payload as no image rather than a broken one', () => {
    expect(toImageDataUrl('   ')).toBeNull();
  });

  it('rejects a non-PNG string rather than generating a broken data URL', () => {
    expect(normalizeImagePayload('not image bytes')).toEqual({
      dataUrl: null,
      encoding: 'unknown',
      length: 15,
    });
  });
});
