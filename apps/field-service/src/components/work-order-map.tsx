import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CarFront,
  Crosshair,
  Layers,
  Loader2,
  LocateFixed,
  LocateOff,
  Minus,
  Play,
  Plus,
  Route as RouteIcon,
} from 'lucide-react';
import { assessSla, type SlaState } from '@/domain/scheduling';
import { hasCoordinates, isUnderway, type GeoPoint, type WorkOrderSummary } from '@/domain/work-order';
import type { LocationStatus } from '@/hooks/use-current-location';
import { configuredBasemaps, tileUrl } from '@/lib/basemap';
import {
  BASEMAP_TONES,
  basemapTone,
  basemapToneFilter,
  type BasemapToneId,
} from '@/lib/basemap-tone';
import { formatDurationShort } from '@/lib/duration';
import { convertDatum, toDatum, type GeoDatum } from '@/lib/geo-datum';
import { preferConnectorBasemap } from '@/lib/map-runtime';
import { routeMidpoint, routePath, ROUTE_DATUM, type RouteLeg } from '@/lib/route-geometry';
import { SLA_FILL } from '@/lib/sla-appearance';
import { staticMapKey, staticMapLayout } from '@/lib/static-basemap';
import { useMapPreferences } from '@/hooks/use-map-preferences';
import { useStaticBasemap } from '@/hooks/use-static-basemap';
import { StaticMapCanvas } from './static-map-canvas';
import {
  fitPoints,
  panView,
  scaleBar,
  tileGrid,
  toScreen,
  zoomAround,
  zoomView,
  viewAtScale,
  type MapView,
  type Pixel,
  type ViewportSize,
} from '@/lib/map-projection';

/** A drag shorter than this is a tap on whatever is underneath. */
const TAP_SLOP_PX = 4;

/**
 * Tolerate a few missing tiles before giving up on a source. A single throttled
 * or 404 tile says nothing about whether the service works.
 */
const TILE_FAILURES_BEFORE_SWITCHING = 4;

export interface WorkOrderMapProps {
  workOrders: readonly WorkOrderSummary[];
  /** Where the technician is starting from. */
  origin?: GeoPoint;
  /** Suggested stop order. Numbers pins only; this is not a road route. */
  visitOrder?: readonly WorkOrderSummary[] | null;
  /**
   * Real driving geometry for the gaps between the ordered stops, in visit
   * order, each flagged with whether that drive still belongs to today. A null
   * leg draws nothing — an unknown leg stays blank rather than being faked with
   * a straight line.
   */
  routeSegments?: readonly { leg: RouteLeg | null; overflow: boolean }[] | null;
  /** Jobs the day cannot absorb; drawn so they read as deferred. */
  overflowIds?: ReadonlySet<string>;
  /** Reported on the locate control rather than as a notice over the map. */
  locationStatus?: LocationStatus;
  onRetryLocation?: () => void;
  /** Route planning lives with the other map controls. */
  routePlanned?: boolean;
  planningRoute?: boolean;
  onToggleRoutePlan?: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Explicit list-driven focus request; map-pin selection does not reset the view. */
  focusRequest?: { key: string; point: GeoPoint } | null;
  /** Told when the basemap turns dark, so surrounding chrome can follow. */
  onDarkChange?: (dark: boolean) => void;
  fullBleed?: boolean;
  controlsTopClassName?: string;
  className?: string;
}

/**
 * The panorama of a day's work.
 *
 * Renders from coordinates only, so it stays correct when the street basemap
 * cannot be reached: the tiles are drawn underneath and simply omitted on
 * failure, leaving jobs, suggested order and scale intact on the app's own grid.
 */
export function WorkOrderMap({
  workOrders,
  origin,
  visitOrder,
  routeSegments,
  overflowIds,
  locationStatus,
  onRetryLocation,
  routePlanned = false,
  planningRoute = false,
  onToggleRoutePlan,
  selectedId,
  onSelect,
  focusRequest,
  onDarkChange,
  fullBleed = false,
  controlsTopClassName = 'top-3',
  className,
}: WorkOrderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [view, setView] = useState<MapView | null>(null);
  const [canvasDecodeFailed, setCanvasDecodeFailed] = useState(false);
  const handleCanvasDecodeError = useCallback(() => setCanvasDecodeFailed(true), []);

  const { toneId, setToneId, traffic, toggleTraffic } = useMapPreferences();
  const tone = useMemo(() => basemapTone(toneId), [toneId]);
  const toneFilter = useMemo(() => basemapToneFilter(tone), [tone]);
  const [toneMenuOpen, setToneMenuOpen] = useState(false);

  const providers = useMemo(configuredBasemaps, []);
  const [providerIndex, setProviderIndex] = useState(() =>
    preferConnectorBasemap() ? providers.length : 0,
  );
  const basemap = providers[providerIndex] ?? null;
  const tilesExhausted = providers.length > 0 && providerIndex >= providers.length;
  const failures = useRef(0);

  // Tiles are blocked in the hosted app, so the connector-rendered image takes
  // over as soon as direct tile loading has proved unavailable.
  const {
    images: staticImages,
    status: staticStatus,
    error: staticError,
    retry: retryStaticBasemap,
  } = useStaticBasemap(view, size, tilesExhausted, traffic);
  const exhausted =
    tilesExhausted &&
    ((staticStatus === 'failed' && staticImages.length === 0) || canvasDecodeFailed);

  useEffect(() => {
    if (staticImages.length > 0) setCanvasDecodeFailed(false);
  }, [staticImages]);

  useEffect(() => {
    onDarkChange?.(tone.dark);
  }, [tone.dark, onDarkChange]);

  // AMap renders GCJ-02; direct tile providers render WGS-84.
  const datum = tilesExhausted ? 'gcj02' : (basemap?.datum ?? 'wgs84');

  const handleTileError = useCallback(() => {
    failures.current += 1;
    if (failures.current < TILE_FAILURES_BEFORE_SWITCHING) return;
    failures.current = 0;
    // Move to the next source rather than abandoning the basemap outright.
    setProviderIndex((index) => index + 1);
  }, []);

  const placed = useMemo(() => workOrders.filter(hasCoordinates), [workOrders]);

  // Everything is projected in the basemap's own datum, never mixed.
  const pins = useMemo(
    () => placed.map((workOrder) => ({ workOrder, point: toDatum(workOrder.address.location, datum) })),
    [placed, datum],
  );
  const originPoint = useMemo(() => (origin ? toDatum(origin, datum) : undefined), [origin, datum]);

  const framed = useMemo<GeoPoint[]>(
    () => (originPoint ? [originPoint, ...pins.map((pin) => pin.point)] : pins.map((pin) => pin.point)),
    [pins, originPoint],
  );

  const fit = useCallback(
    (viewport: ViewportSize) =>
      fitPoints(framed, viewport, { padding: 56, maxZoom: 15, fallbackCenter: originPoint }),
    [framed, originPoint],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = (width: number, height: number) => {
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    const initial = element.getBoundingClientRect();
    updateSize(initial.width, initial.height);

    const observer = new ResizeObserver(([entry]) => {
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Re-frame when the jobs change or the box is resized, but not after a pan —
  // the technician's own adjustment must survive an unrelated re-render.
  const fitKey = `${framed.map((p) => `${p.latitude},${p.longitude}`).join('|')}@${Math.round(size.width)}x${Math.round(size.height)}`;
  const lastFitKey = useRef<string | null>(null);
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    if (lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    setView(fit(size));
  }, [fitKey, fit, size]);

  useEffect(() => {
    if (!focusRequest || size.width === 0 || size.height === 0) return;
    setView(viewAtScale(toDatum(focusRequest.point, datum), 5_000));
  }, [focusRequest?.key, datum, size.width, size.height]);

  const pointers = useRef(new Map<number, Pixel>());
  const pinchDistance = useRef<number | null>(null);
  const dragged = useRef(false);
  const capturedPointers = useRef(new Set<number>());

  /**
   * Capture is taken only once a gesture is really a drag. Capturing on
   * pointerdown retargets pointerup to this container, which makes the click
   * land here instead of on the pin or control that was tapped.
   */
  const capturePointer = (element: HTMLElement, pointerId: number) => {
    if (capturedPointers.current.has(pointerId)) return;
    try {
      element.setPointerCapture(pointerId);
      capturedPointers.current.add(pointerId);
    } catch {
      // The pointer ended before capture began; the gesture simply stops here.
    }
  };

  const localPoint = (event: { clientX: number; clientY: number }): Pixel => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged.current = false;
    if (pointers.current.size === 2) pinchDistance.current = null;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);

    if (pointers.current.size === 1) {
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) {
        dragged.current = true;
        capturePointer(event.currentTarget, event.pointerId);
      }
      setView((v) => (v ? panView(v, dx, dy) : v));
      return;
    }

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const previousDistance = pinchDistance.current;
      pinchDistance.current = distance;
      if (previousDistance === null || previousDistance === 0 || distance === 0) return;
      dragged.current = true;
      capturePointer(event.currentTarget, event.pointerId);
      const midpoint = localPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      setView((v) => (v ? zoomAround(v, Math.log2(distance / previousDistance), midpoint, size) : v));
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    // The browser releases capture itself on pointerup; only the record is ours.
    capturedPointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = null;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    setView((v) => (v ? zoomAround(v, event.deltaY > 0 ? -0.5 : 0.5, localPoint(event), size) : v));
  };

  const tiles = useMemo(
    () => (view && basemap ? tileGrid(view, size) : []),
    [view, size, basemap],
  );

  const orderIndex = useMemo(() => {
    const index = new Map<string, number>();
    visitOrder?.forEach((workOrder, position) => index.set(workOrder.id, position + 1));
    return index;
  }, [visitOrder]);

  const bar = view ? scaleBar(view, 96) : null;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={handleWheel}
      onClick={() => {
        if (!dragged.current) onSelect(null);
      }}
      // The map owns its gestures; without this the page scrolls instead of panning.
      className={`${fullBleed ? 'fixed inset-0' : 'relative'} touch-none select-none overflow-hidden bg-muted ${
        fullBleed ? '' : 'rounded-2xl ring-1 ring-border'
      } ${className ?? ''}`}
    >
      <SchematicBackdrop />

      {view &&
        staticImages.map((image) => (
          <StaticMapCanvas
            key={staticMapKey(image.request)}
            dataUrl={image.dataUrl}
            layout={staticMapLayout(image.request, view, size)}
            tone={tone}
            onDecodeError={handleCanvasDecodeError}
          />
        ))}

      {basemap &&
        tiles.map((tile) => (
          <img
            key={`${basemap.id}/${tile.key}`}
            src={tileUrl(basemap.template, tile)}
            alt=""
            draggable={false}
            loading="lazy"
            // Embedded hosts vary in what Referer they send; tile services that
            // filter on it should see none rather than an unexpected origin.
            referrerPolicy="no-referrer"
            onError={handleTileError}
            className="pointer-events-none absolute opacity-90 dark:opacity-70"
            style={{
              left: tile.left,
              top: tile.top,
              width: tile.size,
              height: tile.size,
              filter: toneFilter,
            }}
          />
        ))}

      {view && routeSegments && routeSegments.length > 0 && (
        <RouteOverlay segments={routeSegments} view={view} size={size} datum={datum} />
      )}

      {view && originPoint && <OriginMarker at={toScreen(originPoint, view, size)} />}

      {view &&
        pins.map(({ workOrder, point }) => (
          <MapPin
            key={workOrder.id}
            workOrder={workOrder}
            at={toScreen(point, view, size)}
            sequence={orderIndex.get(workOrder.id) ?? null}
            overflow={overflowIds?.has(workOrder.id) ?? false}
            selected={workOrder.id === selectedId}
            onSelect={onSelect}
          />
        ))}

      {/* Above the pins: a control the technician cannot press is not a control. */}
      <div className={`absolute right-3 z-30 flex flex-col gap-1 ${controlsTopClassName}`}>
        <MapControl label="放大" onClick={() => setView((v) => (v ? zoomView(v, 1) : v))}>
          <Plus className="h-4 w-4" />
        </MapControl>
        <MapControl label="缩小" onClick={() => setView((v) => (v ? zoomView(v, -1) : v))}>
          <Minus className="h-4 w-4" />
        </MapControl>
        <MapControl
          label="回到全景"
          onClick={() => {
            lastFitKey.current = fitKey;
            setView(fit(size));
          }}
        >
          <Crosshair className="h-4 w-4" />
        </MapControl>
        {locationStatus && (
          <LocateControl
            status={locationStatus}
            onRetry={onRetryLocation}
            onCentre={() => {
              if (!originPoint || !view) return;
              setView({ center: originPoint, zoom: Math.max(view.zoom, 14) });
            }}
          />
        )}
        {/* Anchored to the button, not to the column, so adding controls above
            cannot pull the menu out of line. */}
        <div className="relative">
          <MapControl
            label="地图风格"
            active={toneMenuOpen}
            onClick={() => setToneMenuOpen((open) => !open)}
          >
            <Layers className="h-4 w-4" />
          </MapControl>

          {toneMenuOpen && (
            <div
              role="radiogroup"
              aria-label="地图风格"
              onClick={(event) => event.stopPropagation()}
              className="absolute right-10 top-1/2 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl bg-card p-1 shadow-lg ring-1 ring-border"
            >
              {BASEMAP_TONES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === toneId}
                  onClick={() => {
                    setToneId(option.id as BasemapToneId);
                    setToneMenuOpen(false);
                  }}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-xs ${
                    option.id === toneId
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <MapControl
          label={traffic ? '关闭实时路况' : '显示实时路况'}
          active={traffic}
          onClick={toggleTraffic}
        >
          <CarFront className="h-4 w-4" />
        </MapControl>

        {onToggleRoutePlan && (
          <MapControl
            label={
              planningRoute ? '正在规划今日路线' : routePlanned ? '清除今日路线' : '规划今日路线'
            }
            active={routePlanned}
            disabled={planningRoute}
            busy={planningRoute}
            onClick={onToggleRoutePlan}
          >
            {planningRoute ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RouteIcon className="h-4 w-4" />
            )}
          </MapControl>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-2 left-3 flex items-end gap-2">
        {bar && (
          <div className="text-[10px] leading-tight text-muted-foreground">
            <div
              className="mb-0.5 h-1.5 border-x border-b border-muted-foreground/60"
              style={{ width: Math.round(bar.width) }}
            />
            {bar.metres >= 1000 ? `${bar.metres / 1000} km` : `${bar.metres} m`}
          </div>
        )}
        {basemap && !tilesExhausted && basemap.attribution && (
          <span className="text-[10px] text-muted-foreground/70">{basemap.attribution}</span>
        )}
        {staticImages.length > 0 && (
          <span className="text-[10px] text-muted-foreground/70">© 高德地图</span>
        )}
      </div>

      {exhausted && (
        <button
          type="button"
          title={staticError ?? undefined}
          onClick={(event) => {
            event.stopPropagation();
            retryStaticBasemap();
          }}
          className="absolute bottom-2 right-3 rounded-full bg-card px-2.5 py-1 text-[10px] text-rose-600 shadow ring-1 ring-border"
        >
          高德底图失败 · 点击重试
        </button>
      )}

      {tilesExhausted && staticStatus === 'loading' && staticImages.length === 0 && (
        <span className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-card px-2.5 py-1 text-[10px] text-muted-foreground shadow ring-1 ring-border">
          高德底图加载中…
        </span>
      )}
    </div>
  );
}

/** Drawn with CSS only, so the map is never an empty rectangle. */
function SchematicBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.35]"
      style={{
        backgroundImage:
          'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    />
  );
}

function OriginMarker({ at }: { at: Pixel }) {
  return (
    <span
      aria-label="当前位置"
      className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/25"
      style={{ left: at.x, top: at.y }}
    />
  );
}

/** Amber marks work the day cannot absorb, matching the wording elsewhere. */
const OVERFLOW_STROKE = '#f59e0b';

/**
 * The driving route, drawn as it is actually driven.
 *
 * A casing stroke under the line keeps it readable over dense basemap imagery.
 * Each leg carries its own travel time, because the cost of the day is in the
 * gaps between jobs and that cost should be visible where it is incurred.
 * Legs that run past the shift are drawn dashed and amber, so the point the day
 * stops being achievable is visible on the map rather than only in a summary.
 */
function RouteOverlay({
  segments,
  view,
  size,
  datum,
}: {
  segments: readonly { leg: RouteLeg | null; overflow: boolean }[];
  view: MapView;
  size: ViewportSize;
  datum: GeoDatum;
}) {
  const drawn = segments
    .map((segment, index) => {
      if (!segment.leg) return null;
      const path = routePath(segment.leg.points, view, size, datum);
      const midpoint = routeMidpoint(segment.leg.points);
      if (!path || !midpoint) return null;
      return {
        index,
        path,
        overflow: segment.overflow,
        minutes: segment.leg.durationSeconds / 60,
        at: toScreen(convertDatum(midpoint, ROUTE_DATUM, datum), view, size),
      };
    })
    .filter((leg): leg is NonNullable<typeof leg> => leg !== null);

  if (drawn.length === 0) return null;

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0"
        width={size.width}
        height={size.height}
        aria-hidden
      >
        {drawn.map((leg) => (
          <path
            key={`casing-${leg.index}`}
            d={leg.path}
            fill="none"
            stroke="white"
            strokeOpacity={0.85}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {drawn.map((leg) => (
          <path
            key={`route-${leg.index}`}
            d={leg.path}
            fill="none"
            stroke={leg.overflow ? OVERFLOW_STROKE : 'var(--color-primary, #2563eb)'}
            strokeWidth={3.5}
            strokeDasharray={leg.overflow ? '7 6' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {drawn.map((leg) => (
        <span
          key={`label-${leg.index}`}
          className={`pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-medium shadow ring-1 ${
            leg.overflow
              ? 'bg-amber-50 text-amber-700 ring-amber-500/50 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-card/95 text-foreground ring-border'
          }`}
          style={{ left: leg.at.x, top: leg.at.y }}
        >
          {formatDurationShort(leg.minutes)}
        </span>
      ))}
    </>
  );
}

function MapPin({
  workOrder,
  at,
  sequence,
  overflow,
  selected,
  onSelect,
}: {
  workOrder: WorkOrderSummary;
  at: Pixel;
  sequence: number | null;
  overflow: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { state } = assessSla(workOrder);
  const underway = isUnderway(workOrder);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(workOrder.id);
      }}
      aria-label={`${workOrder.customerName} ${workOrder.number}${underway ? ' 进行中' : ''}${
        overflow ? ' 今日无法完成' : ''
      }`}
      aria-pressed={selected}
      className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform ${
        selected ? 'z-20 scale-110' : underway ? 'z-[15]' : 'z-10'
      }`}
      style={{ left: at.x, top: at.y }}
    >
      <span
        className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-md ${
          SLA_FILL[state]
        } ${
          selected
            ? 'ring-2 ring-foreground'
            : underway
              ? 'ring-2 ring-primary'
              : overflow
                ? 'ring-[3px] ring-amber-500'
                : 'ring-2 ring-white/90'
        }`}
      >
        {underway ? <Play className="h-3.5 w-3.5 fill-current" /> : (sequence ?? '●')}
        {underway && (
          <span className="absolute -inset-1 animate-ping rounded-full ring-2 ring-primary/60" />
        )}
      </span>
      {(selected || underway) && (
        <span className="mt-1 max-w-[8rem] truncate rounded-full bg-card/95 px-2 py-0.5 text-[11px] text-foreground shadow ring-1 ring-border">
          {underway ? '进行中' : workOrder.customerName}
        </span>
      )}
    </button>
  );
}

/**
 * The locate control carries the state of the fix itself, so a failed location
 * costs no space over the map and is retried where it is noticed.
 */
function LocateControl({
  status,
  onRetry,
  onCentre,
}: {
  status: LocationStatus;
  onRetry?: () => void;
  onCentre: () => void;
}) {
  const failed = status === 'denied' || status === 'unavailable';
  const label =
    status === 'ready'
      ? '回到当前位置'
      : status === 'locating'
        ? '正在定位'
        : status === 'denied'
          ? '定位被拒绝，点击重试'
          : '未获取到位置，点击重试';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-busy={status === 'locating'}
      onClick={(event) => {
        event.stopPropagation();
        if (status === 'ready') onCentre();
        else onRetry?.();
      }}
      className={`relative flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ring-1 ring-border ${
        failed ? 'bg-card/90 text-amber-600 dark:text-amber-400' : 'bg-card/90 text-foreground'
      }`}
    >
      {failed ? <LocateOff className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
      {status === 'locating' && (
        <span className="absolute -inset-0.5 animate-ping rounded-lg ring-2 ring-primary/50" />
      )}
      {failed && (
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card" />
      )}
    </button>
  );
}

function MapControl({
  label,
  onClick,
  active = false,
  disabled = false,
  busy = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      aria-busy={busy}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ring-1 ring-border disabled:cursor-progress ${
        active ? 'bg-primary text-primary-foreground' : 'bg-card/90 text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
