declare module 'upng-js' {
  export interface DecodedPng {
    width: number;
    height: number;
    data: ArrayBuffer;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: Record<string, unknown>;
  }

  const UPNG: {
    decode(buffer: ArrayBuffer): DecodedPng;
    toRGBA8(image: DecodedPng): ArrayBuffer[];
  };

  export default UPNG;
}
