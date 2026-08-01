import { describe, expect, it } from 'vitest';
import { base64ToBytes, dataUrlBase64, decodePngBase64 } from '@/lib/png-canvas';
import knownPngUrl from '@/assets/amap-known-probe.png?inline';

const knownBase64 = dataUrlBase64(knownPngUrl)!;

describe('PNG canvas decoder', () => {
  it('decodes the exact bundled AMap PNG without any host image API', () => {
    const decoded = decodePngBase64(knownBase64);
    expect(decoded.width).toBe(100);
    expect(decoded.height).toBe(100);
    expect(decoded.pixels).toHaveLength(100 * 100 * 4);
    expect(decoded.pixels.some((channel) => channel !== 0)).toBe(true);
  });

  it('restores the original PNG signature from base64', () => {
    expect([...base64ToBytes(knownBase64).slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it('extracts only PNG base64 data URLs', () => {
    expect(dataUrlBase64(`data:image/png;base64,${knownBase64}`)).toBe(knownBase64);
    expect(dataUrlBase64('data:image/gif;base64,abc')).toBeNull();
  });
});
