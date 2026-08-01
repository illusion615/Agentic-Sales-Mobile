import { describe, expect, it } from 'vitest';
import {
  applyBasemapTone,
  basemapTone,
  basemapToneFilter,
  BASEMAP_TONES,
  DEFAULT_BASEMAP_TONE,
} from '@/lib/basemap-tone';

const pixel = (r: number, g: number, b: number, a = 255) =>
  new Uint8ClampedArray([r, g, b, a]);

/** A saturated green POI icon — the clutter the tone is meant to suppress. */
const POI_GREEN = () => pixel(46, 168, 82);

describe('basemapTone', () => {
  it('defaults to a toned-down map so pins own saturated colour', () => {
    expect(DEFAULT_BASEMAP_TONE).toBe('muted');
    expect(basemapTone(DEFAULT_BASEMAP_TONE).desaturate).toBeGreaterThan(0);
  });

  it('falls back to the default rather than rendering nothing for an unknown id', () => {
    expect(basemapTone('sepia' as never).id).toBe('muted');
  });
});

describe('applyBasemapTone', () => {
  it('leaves pixels untouched for the standard tone', () => {
    const pixels = POI_GREEN();
    applyBasemapTone(pixels, basemapTone('standard'));
    expect([...pixels]).toEqual([46, 168, 82, 255]);
  });

  it('removes colour entirely in grey', () => {
    const pixels = POI_GREEN();
    applyBasemapTone(pixels, basemapTone('grey'));
    expect(pixels[0]).toBe(pixels[1]);
    expect(pixels[1]).toBe(pixels[2]);
  });

  it('reduces colour without erasing it in muted', () => {
    const original = POI_GREEN();
    const pixels = POI_GREEN();
    applyBasemapTone(pixels, basemapTone('muted'));

    const spread = (p: Uint8ClampedArray) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
    expect(spread(pixels)).toBeGreaterThan(0);
    expect(spread(pixels)).toBeLessThan(spread(original));
  });

  it('turns a light map dark for night without touching alpha', () => {
    const paper = pixel(250, 250, 248);
    applyBasemapTone(paper, basemapTone('night'));

    const luminance = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
    expect(luminance).toBeLessThan(80);
    expect(paper[3]).toBe(255);
  });

  it('treats every pixel in a buffer, not just the first', () => {
    const pixels = new Uint8ClampedArray([...POI_GREEN(), ...POI_GREEN()]);
    applyBasemapTone(pixels, basemapTone('grey'));
    expect(pixels[4]).toBe(pixels[5]);
    expect(pixels[5]).toBe(pixels[6]);
  });
});

describe('basemapToneFilter', () => {
  it('asks for no filter when the tone changes nothing', () => {
    expect(basemapToneFilter(basemapTone('standard'))).toBeUndefined();
  });

  it('expresses the same intent as the pixel path for DOM tiles', () => {
    expect(basemapToneFilter(basemapTone('grey'))).toContain('saturate(0.00)');
    expect(basemapToneFilter(basemapTone('night'))).toContain('invert(1)');
  });

  it('darkens rather than brightens when the paper is dark', () => {
    const filter = basemapToneFilter(basemapTone('night')) ?? '';
    const brightness = Number(/brightness\(([\d.]+)\)/.exec(filter)?.[1]);
    expect(brightness).toBeLessThan(1);
  });

  it('offers exactly one control per published tone', () => {
    expect(BASEMAP_TONES.map((tone) => tone.id)).toEqual([
      'standard',
      'muted',
      'grey',
      'night',
    ]);
  });
});
