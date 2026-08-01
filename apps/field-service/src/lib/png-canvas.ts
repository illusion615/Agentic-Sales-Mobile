import UPNG from 'upng-js';
import { applyBasemapTone, type BasemapTone } from './basemap-tone';

/** Decode base64 without depending on the host's native image decoder. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export interface DecodedRgba {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export function decodePngBase64(base64: string): DecodedRgba {
  const bytes = base64ToBytes(base64);
  const source = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(source).set(bytes);
  const decoded = UPNG.decode(source);
  const rgba = UPNG.toRGBA8(decoded)[0];
  return {
    width: decoded.width,
    height: decoded.height,
    pixels: new Uint8ClampedArray(rgba),
  };
}

export function dataUrlBase64(dataUrl: string): string | null {
  const match = /^data:image\/png;base64,(.+)$/s.exec(dataUrl);
  return match?.[1] ?? null;
}

export function drawPngDataUrl(
  canvas: HTMLCanvasElement,
  dataUrl: string,
  tone?: BasemapTone,
): boolean {
  const base64 = dataUrlBase64(dataUrl);
  if (!base64) return false;

  try {
    const decoded = decodePngBase64(base64);
    if (tone) applyBasemapTone(decoded.pixels, tone);
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    const imageData = context.createImageData(decoded.width, decoded.height);
    imageData.data.set(decoded.pixels);
    context.putImageData(imageData, 0, 0);
    return true;
  } catch {
    return false;
  }
}
