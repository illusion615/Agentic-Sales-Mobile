import { useEffect, useMemo, useRef, useState } from 'react';
import { AMapStaticMapService } from '@/generated/services/AMapStaticMapService';
import { getAMapWebServiceKey } from '@/data/amap-config';
import type { RoadTravel } from '@/domain/day-plan';
import type { GeoPoint } from '@/domain/work-order';
import { wgs84ToGcj02 } from '@/lib/geo-datum';
import { coordinate, legKey, parsePolyline, type RouteLeg } from '@/lib/route-geometry';

/** Traffic-aware, avoids congestion; the strategy a technician actually drives. */
const TRAFFIC_AWARE_STRATEGY = 32;

/** Legs are fetched a couple at a time so a long day does not burst the connector. */
const MAX_CONCURRENT_REQUESTS = 2;
const REQUEST_TIMEOUT_MS = 12_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('路线服务响应超时')), REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export type DayRouteStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'failed';

export interface DayRoute {
  /** One entry per leg, aligned with the gaps between the given stops. */
  legs: (RouteLeg | null)[];
  status: DayRouteStatus;
  error: string | null;
  /** Road travel for day planning; undefined where the leg is not known. */
  travel: (from: GeoPoint, to: GeoPoint) => RoadTravel | undefined;
}

/**
 * Real driving routes between consecutive stops.
 *
 * Legs are cached by coordinate pair, so re-ordering a day re-uses everything
 * it already knows and only pays for the legs that are genuinely new. Failures
 * are reported per leg: the rest of the route still draws, and the day plan
 * falls back to an openly-labelled estimate for whatever is missing.
 */
export function useDayRoute(stops: readonly GeoPoint[], enabled: boolean): DayRoute {
  const cache = useRef(new Map<string, RouteLeg>());
  const failed = useRef(new Set<string>());
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<DayRouteStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const pairs = useMemo(() => {
    const list: Array<{ key: string; from: GeoPoint; to: GeoPoint }> = [];
    for (let index = 1; index < stops.length; index++) {
      const from = stops[index - 1];
      const to = stops[index];
      list.push({ key: legKey(from, to), from, to });
    }
    return list;
  }, [stops]);

  const routeKey = pairs.map((pair) => pair.key).join('|');

  useEffect(() => {
    if (!enabled || pairs.length === 0) {
      if (!enabled) failed.current.clear();
      setStatus('idle');
      return;
    }

    const missing = pairs.filter(
      (pair) => !cache.current.has(pair.key) && !failed.current.has(pair.key),
    );
    if (missing.length === 0) {
      setStatus(pairs.every((pair) => cache.current.has(pair.key)) ? 'ready' : 'partial');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    void (async () => {
      let lastError: string | null = null;
      let serviceKey: string;
      try {
        serviceKey = await getAMapWebServiceKey();
      } catch (cause) {
        if (cancelled) return;
        setStatus('failed');
        setError(cause instanceof Error ? cause.message : '读取地图服务配置失败');
        return;
      }

      for (let offset = 0; offset < missing.length; offset += MAX_CONCURRENT_REQUESTS) {
        const batch = missing.slice(offset, offset + MAX_CONCURRENT_REQUESTS);
        let succeeded = 0;
        await Promise.all(
          batch.map(async (pair) => {
            try {
              const result = await withTimeout(
                AMapStaticMapService.GetDrivingRoute(
                  serviceKey,
                  coordinate(wgs84ToGcj02(pair.from)),
                  coordinate(wgs84ToGcj02(pair.to)),
                  TRAFFIC_AWARE_STRATEGY,
                ),
              );
              if (!result.success) {
                failed.current.add(pair.key);
                lastError = result.error?.message ?? '路线服务调用失败';
                return;
              }
              cache.current.set(pair.key, {
                distanceMetres: result.data.distanceMetres ?? 0,
                durationSeconds: result.data.durationSeconds ?? 0,
                trafficLights: result.data.trafficLights ?? 0,
                points: parsePolyline(result.data.polyline ?? ''),
              });
              succeeded += 1;
            } catch (cause) {
              failed.current.add(pair.key);
              lastError = cause instanceof Error ? cause.message : '路线服务异常';
            }
          }),
        );
        if (cancelled) return;

        // If an entire batch failed, the service is unavailable rather than a
        // single leg being bad. Stop spending calls and estimate the rest.
        if (succeeded === 0) {
          for (const pair of missing.slice(offset + batch.length)) failed.current.add(pair.key);
          break;
        }
      }

      if (cancelled) return;
      const complete = pairs.every((pair) => cache.current.has(pair.key));
      setError(lastError);
      setStatus(complete ? 'ready' : cache.current.size > 0 ? 'partial' : 'failed');
      setRevision((value) => value + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [routeKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const legs = useMemo(
    () => pairs.map((pair) => cache.current.get(pair.key) ?? null),
    // `revision` is what makes newly cached legs visible to the render.
    [routeKey, revision], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const travel = useMemo(
    () => (from: GeoPoint, to: GeoPoint) => {
      const leg = cache.current.get(legKey(from, to));
      return leg
        ? { distanceMetres: leg.distanceMetres, durationSeconds: leg.durationSeconds }
        : undefined;
    },
    [revision],
  );

  return { legs, status, error, travel };
}
