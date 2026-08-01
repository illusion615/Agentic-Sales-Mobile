import { useCallback, useEffect, useRef, useState } from 'react';
import { AMapStaticMapService } from '@/generated/services/AMapStaticMapService';
import type { MapView, ViewportSize } from '@/lib/map-projection';
import { loadCachedBasemap, saveCachedBasemap } from '@/lib/basemap-cache';
import {
  amapStaticParams,
  imagePayloadFingerprint,
  normalizeImagePayload,
  staticMapKey,
  staticMapCanvasRequests,
  type StaticMapRequest,
} from '@/lib/static-basemap';

export interface StaticBasemapImage {
  dataUrl: string;
  request: StaticMapRequest;
}

export type StaticBasemapStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Wait for the view to settle before spending a call on it. */
const SETTLE_MS = 350;
const MAX_CONCURRENT_REQUESTS = 2;

/**
 * Fetches the basemap image for the current view through the map connector.
 *
 * The previous image is kept on screen while a new one is fetched, so panning
 * never flashes an empty map. A failure leaves the last good image in place and
 * reports itself, rather than blanking the work surface.
 */
export function useStaticBasemap(
  view: MapView | null,
  size: ViewportSize,
  enabled: boolean,
  traffic = false,
): {
  images: StaticBasemapImage[];
  status: StaticBasemapStatus;
  error: string | null;
  retry: () => void;
} {
  const [images, setImages] = useState<StaticBasemapImage[]>(() => {
    if (!enabled) return [];
    const cached = loadCachedBasemap();
    return cached ? [{ dataUrl: cached.dataUrl, request: cached.request }] : [];
  });
  const [status, setStatus] = useState<StaticBasemapStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const inFlight = useRef<string | null>(null);
  // Debouncing protects against spending calls mid-gesture, not against the
  // first paint, which has nothing on screen to protect.
  const painted = useRef(images.length > 0);

  const requests = enabled && view ? staticMapCanvasRequests(view, size, traffic) : [];
  const key = requests.length > 0 ? requests.map(staticMapKey).join('|') : null;

  const retry = useCallback(() => {
    inFlight.current = null;
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (requests.length === 0 || !key) {
      setStatus('idle');
      return;
    }
    if (inFlight.current === key) return;

    setStatus('loading');
    setError(null);
    let cancelled = false;

    const timer = setTimeout(async () => {
      inFlight.current = key;
      try {
        const fetched: Array<{
          request: StaticMapRequest;
          result: Awaited<ReturnType<typeof AMapStaticMapService.GetStaticMap>>;
          normalized: ReturnType<typeof normalizeImagePayload>;
        }> = [];

        for (let offset = 0; offset < requests.length; offset += MAX_CONCURRENT_REQUESTS) {
          const batch = await Promise.all(
            requests.slice(offset, offset + MAX_CONCURRENT_REQUESTS).map(async (request) => {
            const params = amapStaticParams(request);
            const result = await AMapStaticMapService.GetStaticMap(
              params.location,
              params.zoom,
              params.size,
              params.scale,
              params.traffic,
            );
            const normalized = result.success
              ? normalizeImagePayload(result.data as unknown)
              : { dataUrl: null, encoding: 'unknown' as const, length: 0 };
            return { request, result, normalized };
            }),
          );
          fetched.push(...batch);
          if (cancelled) return;
        }
        if (cancelled) return;

        const complete = fetched.every((item) => item.normalized.dataUrl !== null);
        if (complete) {
          const next = fetched.map((item) => ({
            dataUrl: item.normalized.dataUrl!,
            request: item.request,
          }));
          setImages(next);
          painted.current = true;
          saveCachedBasemap(next[0]);
          setStatus('ready');
        } else {
          setStatus('failed');
          const failed = fetched.find((item) => !item.normalized.dataUrl)!;
          setError(
            failed.result.success
              ? `不是有效 PNG · ${failed.normalized.encoding} · ${imagePayloadFingerprint(failed.result.data)}`
              : failed.result.error?.message ?? '连接器调用失败',
          );
        }
      } catch (cause) {
        if (cancelled) return;
        setStatus('failed');
        setError(cause instanceof Error ? cause.message : '连接器调用异常');
      } finally {
        if (inFlight.current === key) inFlight.current = null;
      }
    }, painted.current ? SETTLE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // The request array is rebuilt each render; its identity is the key.
  }, [key, retryNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return { images, status, error, retry };
}
