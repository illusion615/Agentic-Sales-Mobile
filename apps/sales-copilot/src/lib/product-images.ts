export type ImageFallbackCategory =
  | 'Patient Monitoring'
  | 'Ultrasound'
  | 'Anesthesia'
  | 'IVD'
  | 'Medical Imaging'
  | 'default';

function svgPlaceholder(label: string, color1: string, color2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs>
    <rect width="600" height="400" fill="url(#g)"/>
    <text x="300" y="200" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="white" opacity="0.9">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const imageFallbackByCategory: Record<ImageFallbackCategory, string> = {
  'Patient Monitoring': svgPlaceholder('Patient Monitoring', '#0e7490', '#164e63'),
  Ultrasound: svgPlaceholder('Ultrasound', '#0369a1', '#1e3a5f'),
  Anesthesia: svgPlaceholder('Anesthesia', '#4f46e5', '#312e81'),
  IVD: svgPlaceholder('IVD', '#059669', '#064e3b'),
  'Medical Imaging': svgPlaceholder('Medical Imaging', '#7c3aed', '#4c1d95'),
  default: svgPlaceholder('Medical Device', '#475569', '#1e293b'),
};
