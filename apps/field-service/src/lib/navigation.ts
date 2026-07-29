import type { ServiceAddress } from '@/domain/work-order';

/**
 * Hand off to the device's map app for turn-by-turn navigation.
 *
 * Routing is deliberately delegated rather than drawn in-app: the technician
 * already trusts their map app, and a code app cannot reach a routing service
 * directly from the host iframe.
 */
export function navigationUrl(address: ServiceAddress): string {
  const destination = address.location
    ? `${address.location.latitude},${address.location.longitude}`
    : address.line1;
  const encoded = encodeURIComponent(destination);

  const isApple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  return isApple
    ? `https://maps.apple.com/?daddr=${encoded}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}
