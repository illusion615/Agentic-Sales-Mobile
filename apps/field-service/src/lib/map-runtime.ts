/** Which basemap transport is reliable in the current host. */

export interface LocationLike {
  hostname: string;
}

export function isLocalPreview(location: LocationLike | null): boolean {
  if (!location) return false;
  return (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '::1'
  );
}

/** Hosted Edge and Power Apps Mobile use one connector path for consistent behaviour. */
export function preferConnectorBasemap(
  location: LocationLike | null = typeof window === 'undefined' ? null : window.location,
): boolean {
  return !isLocalPreview(location);
}
