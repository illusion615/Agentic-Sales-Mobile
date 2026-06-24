/**
 * Test suite: product-images.ts
 * Tests that fallback images use inline SVG data URIs (no external CDN).
 */
import { describe, it, expect } from 'vitest';
import { imageFallbackByCategory } from '@/lib/product-images';

describe('product-images', () => {
  const categories = [
    'Patient Monitoring',
    'Ultrasound',
    'Anesthesia',
    'IVD',
    'Medical Imaging',
    'default',
  ] as const;

  it('all categories return data URI SVGs (no external URLs)', () => {
    for (const cat of categories) {
      const url = imageFallbackByCategory[cat];
      expect(url).toBeDefined();
      expect(url.startsWith('data:image/svg+xml,')).toBe(true);
      // Must NOT be an external CDN URL (xmlns="http://..." is OK)
      expect(url).not.toMatch(/https?:\/\/cdn\./);
      expect(url).not.toContain('hubblecontent');
    }
  });

  it('each category has a unique image', () => {
    const urls = new Set(categories.map(c => imageFallbackByCategory[c]));
    expect(urls.size).toBe(categories.length);
  });

  it('SVG contains the category label', () => {
    expect(decodeURIComponent(imageFallbackByCategory['Ultrasound'])).toContain('Ultrasound');
    expect(decodeURIComponent(imageFallbackByCategory['default'])).toContain('Medical Device');
  });
});
