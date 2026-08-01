/**
 * Basemap tone.
 *
 * The street basemap and the work-order pins compete for the same colours: a
 * green metro icon reads like an on-track job, a red POI like a breached one.
 * Toning the basemap down is therefore a legibility decision, not decoration —
 * it gives the pins sole ownership of saturated colour.
 *
 * The tone is defined once here as a pixel transform, because the two basemap
 * paths render differently: the connector image is decoded to RGBA and drawn to
 * Canvas, while direct tiles stay DOM images. Both consume this definition
 * rather than each inventing their own treatment.
 */

export type BasemapToneId = 'standard' | 'muted' | 'grey' | 'night';

export interface BasemapTone {
  id: BasemapToneId;
  label: string;
  /** Pull toward luminance; 1 removes colour entirely. */
  desaturate: number;
  /** Pull toward `paper`; lifts contrast off the map so pins stand out. */
  lighten: number;
  paper: readonly [number, number, number];
  /** Flip light and dark before toning, producing a true night map. */
  invert: boolean;
  /** Night maps sit under a dark UI, so the app chrome follows the basemap. */
  dark: boolean;
}

export const BASEMAP_TONES: readonly BasemapTone[] = [
  {
    id: 'standard',
    label: '标准',
    desaturate: 0,
    lighten: 0,
    paper: [255, 255, 255],
    invert: false,
    dark: false,
  },
  {
    id: 'muted',
    label: '淡雅',
    desaturate: 0.72,
    lighten: 0.34,
    paper: [255, 255, 255],
    invert: false,
    dark: false,
  },
  {
    id: 'grey',
    label: '灰度',
    desaturate: 1,
    lighten: 0.22,
    paper: [255, 255, 255],
    invert: false,
    dark: false,
  },
  {
    id: 'night',
    label: '夜间',
    desaturate: 0.55,
    lighten: 0.08,
    paper: [16, 22, 34],
    invert: true,
    dark: true,
  },
];

/** Colour competes with the pins, so the map is toned down by default. */
export const DEFAULT_BASEMAP_TONE: BasemapToneId = 'muted';

export function basemapTone(id: BasemapToneId): BasemapTone {
  return BASEMAP_TONES.find((tone) => tone.id === id) ?? BASEMAP_TONES[1];
}

function isIdentity(tone: BasemapTone): boolean {
  return !tone.invert && tone.desaturate === 0 && tone.lighten === 0;
}

/**
 * Apply a tone to RGBA pixels in place.
 *
 * Alpha is untouched: the basemap is opaque, and rewriting it would only risk
 * punching holes in the one layer the technician orients from.
 */
export function applyBasemapTone(pixels: Uint8ClampedArray, tone: BasemapTone): void {
  if (isIdentity(tone)) return;

  const [paperR, paperG, paperB] = tone.paper;

  for (let index = 0; index < pixels.length; index += 4) {
    let r = pixels[index];
    let g = pixels[index + 1];
    let b = pixels[index + 2];

    if (tone.invert) {
      // Invert then rotate hue 180°, which restores hue while flipping lightness.
      const ir = 255 - r;
      const ig = 255 - g;
      const ib = 255 - b;
      r = -0.574 * ir + 1.43 * ig + 0.144 * ib;
      g = 0.426 * ir + 0.43 * ig + 0.144 * ib;
      b = 0.426 * ir + 1.43 * ig - 0.856 * ib;
    }

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r += (luminance - r) * tone.desaturate;
    g += (luminance - g) * tone.desaturate;
    b += (luminance - b) * tone.desaturate;

    r += (paperR - r) * tone.lighten;
    g += (paperG - g) * tone.lighten;
    b += (paperB - b) * tone.lighten;

    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
  }
}

/**
 * The same tone expressed as a CSS filter, for basemaps that stay DOM images.
 *
 * `lighten` toward white is approximated by a brightness lift; toward a dark
 * paper it becomes a reduction, so both directions read as intended.
 */
export function basemapToneFilter(tone: BasemapTone): string | undefined {
  if (isIdentity(tone)) return undefined;

  const steps: string[] = [];
  if (tone.invert) steps.push('invert(1)', 'hue-rotate(180deg)');
  if (tone.desaturate > 0) steps.push(`saturate(${(1 - tone.desaturate).toFixed(2)})`);
  if (tone.lighten > 0) {
    const towardWhite = tone.paper[0] + tone.paper[1] + tone.paper[2] > 382;
    const amount = towardWhite ? 1 + tone.lighten * 0.5 : 1 - tone.lighten * 0.5;
    steps.push(`brightness(${amount.toFixed(2)})`);
  }
  return steps.length > 0 ? steps.join(' ') : undefined;
}
