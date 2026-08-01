import { useCallback, useEffect, useState } from 'react';
import type { GeoPoint } from '@/domain/work-order';

export type LocationStatus = 'locating' | 'ready' | 'denied' | 'unavailable';

const OPTIONS: PositionOptions = {
  // Planning needs a neighbourhood, not a doorstep; high accuracy costs battery.
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

/**
 * Where the technician actually is.
 *
 * The device is the only honest source for this: a hard-coded origin silently
 * corrupts the first leg of the route and every distance derived from it. When
 * the fix cannot be obtained the position stays null rather than falling back
 * to a plausible-looking guess, so callers degrade visibly instead of lying.
 *
 * Coordinates are WGS-84, matching the rest of the domain.
 */
export function useCurrentLocation(): {
  position: GeoPoint | null;
  accuracyMetres: number | null;
  status: LocationStatus;
  retry: () => void;
} {
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [accuracyMetres, setAccuracyMetres] = useState<number | null>(null);
  const [status, setStatus] = useState<LocationStatus>('locating');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    setStatus('locating');

    navigator.geolocation.getCurrentPosition(
      (fix) => {
        if (cancelled) return;
        setPosition({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
        setAccuracyMetres(Number.isFinite(fix.coords.accuracy) ? fix.coords.accuracy : null);
        setStatus('ready');
      },
      (error) => {
        if (cancelled) return;
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      OPTIONS,
    );

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    position,
    accuracyMetres,
    status,
    retry: useCallback(() => setAttempt((value) => value + 1), []),
  };
}
