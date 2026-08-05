import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, List, Map as MapIcon, Settings } from 'lucide-react';
import { useDataCapabilities, useMyWorkOrders } from '@/hooks/use-work-orders';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useDayRoute } from '@/hooks/use-day-route';
import { useWorkspaceLayout } from '@/hooks/use-workspace-layout';
import { planDay, type DayPlanStop } from '@/domain/day-plan';
import {
  assessSla,
  slaBreakdown,
  sortWorkOrders,
  suggestVisitOrder,
  type SlaState,
  type SortMode,
} from '@/domain/scheduling';
import {
  activeWorkOrder,
  hasCoordinates,
  isOutstanding,
  isPaused,
  isUnderway,
  todayRange,
  type GeoPoint,
  type WorkOrderSummary,
} from '@/domain/work-order';
import { formatClock, formatDistance, formatDurationShort } from '@/lib/duration';
import { legDestinations } from '@/lib/route-geometry';
import { SLA_FILL, SLA_LABEL, SLA_ORDER } from '@/lib/sla-appearance';
import { DayPlanSummary } from '@/components/day-plan-summary';
import { WorkOrderMap } from '@/components/work-order-map';
import {
  WorkOrderDetails,
  WorkOrderHeadline,
  WorkOrderSheet,
  WorkOrderStartAction,
} from '@/components/work-order-sheet';

const SORT_LABELS: Record<SortMode, string> = {
  sla: 'SLA 紧急度',
  promised: '承诺时间',
  distance: '距离',
  priority: '优先级',
};

type ViewMode = 'map' | 'list';

/**
 * The map leads because a day of field work is a route before it is a list;
 * the list stays one tap away for when a technician wants to read rather than
 * orient. The choice is remembered, so the app never argues with someone who
 * has already stated a preference.
 */
const VIEW_MODE_KEY = 'fs-dashboard-view';

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'map';
  } catch {
    return 'map';
  }
}

export function DashboardPage() {
  const workspaceLayout = useWorkspaceLayout();
  const range = useMemo(() => todayRange(), []);
  // Titled from the range actually queried, so the heading can never claim a
  // different day from the work being shown.
  const dayLabel = useMemo(() => {
    const day = new Date(range.from);
    return `${day.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · ${day.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
  }, [range]);
  const { data: allWorkOrders = [], isLoading } = useMyWorkOrders(range);
  const capabilities = useDataCapabilities();

  // The dashboard is a to-do list, so closed jobs drop out of it entirely.
  const workOrders = useMemo(() => allWorkOrders.filter(isOutstanding), [allWorkOrders]);

  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const [sortMode, setSortMode] = useState<SortMode>('sla');
  const [ordering, setOrdering] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ key: string; point: GeoPoint } | null>(null);
  const mapFocusSequence = useRef(0);
  const [mapDark, setMapDark] = useState(false);
  const [planOpen, setPlanOpen] = useState(true);
  // One card at a time; several open cards would each fetch their own briefing.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // A browser that refuses storage still gets a working screen.
    }
  }, [viewMode]);

  // A job that has been closed, or has left the range, must not keep a card open.
  const selected = workOrders.find((workOrder) => workOrder.id === selectedId) ?? null;

  // The route starts wherever the technician is; an invented origin would
  // silently corrupt the first leg and every distance derived from it.
  const location = useCurrentLocation();
  const origin = location.position ?? undefined;

  const sorted = useMemo(
    () => sortWorkOrders(workOrders, sortMode, { origin }),
    [workOrders, sortMode, origin],
  );
  const plan = useMemo(
    () => (ordering ? suggestVisitOrder(workOrders, { origin }) : null),
    [ordering, workOrders, origin],
  );
  const visitOrder = useMemo(() => plan?.map((stop) => stop.workOrder) ?? null, [plan]);

  // Only geocoded stops can be driven to; the route follows the visit order.
  const routeStops = useMemo<GeoPoint[]>(() => {
    if (!plan) return [];
    const points = plan
      .map((stop) => stop.workOrder.address.location)
      .filter((point): point is GeoPoint => point !== undefined);
    if (points.length === 0) return [];
    return origin ? [origin, ...points] : points;
  }, [plan, origin]);

  const route = useDayRoute(routeStops, ordering);
  const planning = ordering && route.status === 'loading';

  // Whether the day actually fits, costed with real driving times when known.
  const dayPlan = useMemo(
    () => (plan ? planDay(plan, { origin, roadTravel: route.travel }) : null),
    [plan, origin, route.travel],
  );
  const stopByOrder = useMemo(() => dayPlan?.stops ?? [], [dayPlan]);
  const overflowIds = useMemo(
    () => new Set(dayPlan?.overflow.map((stop) => stop.workOrder.id) ?? []),
    [dayPlan],
  );

  // Each leg is named by the stop it drives to, so a deferred drive is coloured
  // against the right job.
  const routeSegments = useMemo(() => {
    if (!plan) return null;
    const placed = plan.filter((stop) => stop.workOrder.address.location !== undefined);
    const destinations = legDestinations(placed, origin !== undefined);
    return route.legs.map((leg, index) => ({
      leg,
      overflow: overflowIds.has(destinations[index]?.workOrder.id ?? ''),
    }));
  }, [plan, origin, route.legs, overflowIds]);

  const unplaced = useMemo(() => workOrders.filter((w) => !hasCoordinates(w)), [workOrders]);
  const breached = workOrders.filter((w) => assessSla(w).state === 'breached').length;
  const breakdown = useMemo(() => slaBreakdown(workOrders), [workOrders]);
  // One technician, one job at a time.
  const active = useMemo(() => activeWorkOrder(workOrders), [workOrders]);

  const selectFromList = (workOrder: WorkOrderSummary) => {
    setSelectedId(workOrder.id);
    if (workOrder.address.location) {
      mapFocusSequence.current += 1;
      setMapFocus({ key: `${workOrder.id}-${mapFocusSequence.current}`, point: workOrder.address.location });
    }
  };

  if (workspaceLayout === 'desktop' || workspaceLayout === 'dual') {
    return (
      <div className={`dashboard-workspace app-shell h-[100dvh] overflow-hidden ${mapDark ? 'dark' : ''}`} data-workspace-layout={workspaceLayout}>
        <aside className="dashboard-list flex min-h-0 flex-col border-r border-border bg-background">
          <div className="shrink-0 space-y-3 p-3">
            <DashboardHeader title={dayLabel} outstanding={workOrders.length} breached={breached} breakdown={breakdown} overflow={ordering ? overflowIds.size : 0} viewMode="map" onViewModeChange={() => {}} showViewSwitch={false} />
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <button key={mode} type="button" disabled={ordering} onClick={() => setSortMode(mode)} className={`rounded-full px-3 py-1 text-xs disabled:opacity-40 ${sortMode === mode && !ordering ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground ring-1 ring-border'}`}>
                  {SORT_LABELS[mode]}
                </button>
              ))}
            </div>
            {ordering && dayPlan && <DayPlanSummary plan={dayPlan} loading={route.status === 'loading'} compact expanded={planOpen} onToggle={() => setPlanOpen((open) => !open)} />}
          </div>
          <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pt-0 [scrollbar-gutter:stable]">
            {(visitOrder ?? sorted).map((workOrder, index) => (
              <WorkOrderCard key={workOrder.id} workOrder={workOrder} sequence={visitOrder ? index + 1 : null} stop={stopByOrder[index] ?? null} active={active} expanded={false} onToggle={() => selectFromList(workOrder)} />
            ))}
          </ol>
        </aside>

        <main className="dashboard-map relative min-h-0 overflow-hidden">
          <WorkOrderMap className="h-full w-full !rounded-none !ring-0" controlsTopClassName="top-3" workOrders={workOrders} origin={origin} visitOrder={visitOrder} routeSegments={ordering ? routeSegments : null} overflowIds={overflowIds} selectedId={selectedId} onSelect={setSelectedId} focusRequest={mapFocus} locationStatus={location.status} onRetryLocation={location.retry} routePlanned={ordering} planningRoute={planning} onToggleRoutePlan={() => setOrdering((value) => !value)} onDarkChange={setMapDark} />
        </main>

        <aside className={`dashboard-detail min-h-0 overflow-y-auto border-l border-border bg-background p-4 [scrollbar-gutter:stable] ${selected ? 'is-open' : 'is-empty flex items-center justify-center'}`}>
          {selected ? (
            <div className="mx-auto max-w-xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <WorkOrderHeadline workOrder={selected} />
                <button type="button" onClick={() => setSelectedId(null)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-muted-foreground ring-1 ring-border">关闭</button>
              </div>
              <WorkOrderDetails workOrder={selected} active={active} />
              <div className="sticky bottom-0 mt-4 flex gap-2 bg-gradient-to-t from-background via-background to-transparent pb-2 pt-5">
                <WorkOrderStartAction workOrder={selected} active={active} className="flex-1" />
                <Link to={`/work-orders/${selected.id}`} className="rounded-xl bg-card px-3 py-2.5 text-sm text-foreground ring-1 ring-border">完整工单</Link>
              </div>
            </div>
          ) : (
            <p className="max-w-56 text-center text-sm text-muted-foreground">从列表或地图选择工单，在这里查看背景并开始服务。</p>
          )}
        </aside>
      </div>
    );
  }

  if (viewMode === 'map') {
    return (
      <div
        className={`relative h-[100dvh] w-full overflow-hidden bg-background ${mapDark ? 'dark' : ''}`}
      >
        <WorkOrderMap
          fullBleed
          controlsTopClassName="top-32"
          workOrders={workOrders}
          origin={origin}
          visitOrder={visitOrder}
          routeSegments={ordering ? routeSegments : null}
          overflowIds={overflowIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          locationStatus={location.status}
          onRetryLocation={location.retry}
          routePlanned={ordering}
          planningRoute={planning}
          onToggleRoutePlan={() => setOrdering((value) => !value)}
          onDarkChange={setMapDark}
        />

        <div className="safe-area-top pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
          <DashboardHeader
            title={dayLabel}
            outstanding={workOrders.length}
            breached={breached}
            breakdown={breakdown}
            overflow={ordering ? overflowIds.size : 0}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            className="pointer-events-auto"
          />

          {/* The map controls own the right-hand gutter; everything below the
              header keeps clear of it. */}
          <div className="pr-11">
            {isLoading && (
              <p className="pointer-events-auto mt-2 w-fit rounded-full bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
                加载中…
              </p>
            )}

            {ordering && dayPlan && (
              <DayPlanSummary
                plan={dayPlan}
                loading={route.status === 'loading'}
                compact
                expanded={planOpen}
                onToggle={() => setPlanOpen((open) => !open)}
                className="pointer-events-auto mt-2"
              />
            )}

            {!capabilities.selfScheduling && ordering && (
              <p className="pointer-events-auto mt-2 rounded-xl bg-amber-50/95 p-2 text-xs text-amber-700 shadow-md dark:bg-amber-950/90 dark:text-amber-300">
                当前数据源不支持自主改期，以下顺序仅供参考，需由调度确认。
              </p>
            )}
          </div>

          {unplaced.length > 0 && (
            <div className="pointer-events-auto mt-2 flex max-w-[calc(100%-3.5rem)] gap-1.5 overflow-x-auto pb-1">
              {unplaced.map((workOrder) => (
                <button
                  key={workOrder.id}
                  type="button"
                  onClick={() => setSelectedId(workOrder.id)}
                  className="shrink-0 rounded-full bg-card/95 px-3 py-1.5 text-xs text-foreground shadow-sm ring-1 ring-border"
                >
                  未定位 · {workOrder.number}
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <WorkOrderSheet
            key={selected.id}
            workOrder={selected}
            active={active}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    );
  }

  return (
    // Both modes own the full viewport and scroll internally, so switching view
    // never adds or removes the document scrollbar and resizes the screen.
    <div className="app-shell h-[100dvh] overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        {/* Sticky rather than a second scroll container: sharing one scroller
            keeps the header exactly as wide as the cards beneath it. */}
        <div className="safe-area-top sticky top-0 z-20 -mx-4 -mt-4 flex flex-col gap-3 bg-background px-4 pb-3 pt-4">
          <DashboardHeader
            title="我的工单"
            outstanding={workOrders.length}
            breached={breached}
            breakdown={breakdown}
            overflow={ordering ? overflowIds.size : 0}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                // A planned route IS an ordering, so it replaces sorting rather
                // than silently ignoring it.
                disabled={ordering}
                onClick={() => setSortMode(mode)}
                className={`rounded-full px-3 py-1 text-sm disabled:opacity-40 ${
                  sortMode === mode && !ordering
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground ring-1 ring-border'
                }`}
              >
                {SORT_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

      {!capabilities.selfScheduling && ordering && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          当前数据源不支持自主改期，以下顺序仅供参考，需由调度确认。
        </p>
      )}

      {ordering && dayPlan && (
        <DayPlanSummary
          plan={dayPlan}
          loading={route.status === 'loading'}
          expanded={planOpen}
          onToggle={() => setPlanOpen((open) => !open)}
        />
      )}

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <ol className="flex flex-col gap-3">
        {(visitOrder ?? sorted).map((workOrder, index) => (
          <WorkOrderCard
            key={workOrder.id}
            workOrder={workOrder}
            sequence={visitOrder ? index + 1 : null}
            stop={stopByOrder[index] ?? null}
            active={active}
            expanded={expandedId === workOrder.id}
            onToggle={() =>
              setExpandedId((current) => (current === workOrder.id ? null : workOrder.id))
            }
          />
        ))}
      </ol>

      {selected && (
        <WorkOrderSheet
          key={selected.id}
          workOrder={selected}
          active={active}
          onClose={() => setSelectedId(null)}
        />
      )}
      </div>
    </div>
  );
}

/**
 * One header for both view modes; switching view must not restyle the screen.
 *
 * The legend doubles as the day's tally: every colour on the map is named and
 * counted here, so a pin never depends on the technician remembering what a
 * colour meant.
 */
function DashboardHeader({
  title,
  outstanding,
  breached,
  breakdown,
  overflow,
  viewMode,
  onViewModeChange,
  showViewSwitch = true,
  className,
}: {
  title: string;
  outstanding: number;
  breached: number;
  breakdown: Record<SlaState, number>;
  overflow: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showViewSwitch?: boolean;
  className?: string;
}) {
  const present = SLA_ORDER.filter((state) => breakdown[state] > 0);

  return (
    <header
      className={`glass-surface rounded-2xl p-3 shadow-lg ring-1 ring-border ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {outstanding} 个待办{breached > 0 ? ` · ${breached} 个已超时` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showViewSwitch && <ViewModeSwitch mode={viewMode} onChange={onViewModeChange} />}
          <Link
            to="/settings"
            aria-label="设置"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground ring-1 ring-border"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {(present.length > 0 || overflow > 0) && (
        <ul
          aria-label="工单图例"
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground"
        >
          {present.map((state) => (
            <li key={state} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-full ${SLA_FILL[state]}`} />
              {SLA_LABEL[state]}
              <span className="font-semibold text-foreground">{breakdown[state]}</span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-transparent ring-2 ring-amber-500" />
              今日排不下
              <span className="font-semibold text-foreground">{overflow}</span>
            </li>
          )}
        </ul>
      )}
    </header>
  );
}

function ViewModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const options: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: 'map', label: '地图', icon: <MapIcon className="h-4 w-4" /> },
    { value: 'list', label: '列表', icon: <List className="h-4 w-4" /> },
  ];

  return (
    <div
      role="group"
      aria-label="视图模式"
      className="flex items-center gap-1 rounded-xl bg-muted p-1 ring-1 ring-border"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          className={`flex h-7 w-8 items-center justify-center rounded-lg transition-colors ${
            mode === option.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

/** Travel and arrival for one stop, worded so an estimate never reads as fact. */
function stopTiming(stop: DayPlanStop): string {
  if (stop.travel.source === 'unknown') return `${formatClock(stop.arrival)} 到场`;
  const prefix = stop.travel.source === 'road' ? '车程' : '估算车程';
  return `${prefix} ${formatDurationShort(stop.travel.minutes)} · ${formatDistance(
    stop.travel.km,
  )} · ${formatClock(stop.arrival)} 到场`;
}

function WorkOrderCard({
  workOrder,
  sequence,
  stop,
  active,
  expanded,
  onToggle,
}: {
  workOrder: WorkOrderSummary;
  sequence: number | null;
  stop: DayPlanStop | null;
  active?: WorkOrderSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={`glass-card p-4 shadow-sm ${
        stop && !stop.fitsInDay ? 'ring-1 ring-amber-500/60' : ''
      } ${isUnderway(workOrder) ? 'ring-2 ring-primary' : ''}`}
    >
      {/* The card itself is the affordance; the chevron only reports state. */}
      <div onClick={onToggle} className="cursor-pointer">
        <div className="flex items-start gap-3">
          {sequence !== null && (
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {sequence}
            </span>
          )}
          <WorkOrderHeadline workOrder={workOrder} />
          {isUnderway(workOrder) && (
            <span className="mt-0.5 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
              进行中
            </span>
          )}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? '收起详情' : '展开详情'}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="mt-0.5 shrink-0 text-muted-foreground"
          >
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <p className="mt-1 truncate text-sm text-muted-foreground">{workOrder.address.line1}</p>

        {stop && <p className="mt-2 truncate text-xs text-muted-foreground">{stopTiming(stop)}</p>}
        {isPaused(workOrder) && workOrder.pauseReason && <p className="mt-2 truncate text-xs text-amber-700">挂起原因：{workOrder.pauseReason}</p>}

        {stop && !stop.fitsInDay && (
          <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
            排在班次之外，建议改期或转派
          </p>
        )}
      </div>

      {expanded && (
        <>
          <WorkOrderDetails
            workOrder={workOrder}
            active={active}
            className="mt-3 border-t border-border pt-3"
          />
          <div className="mt-3 flex items-center gap-2">
            <WorkOrderStartAction workOrder={workOrder} active={active} className="flex-1" />
            <Link
              className="shrink-0 rounded-xl bg-card px-3 py-2.5 text-sm text-foreground ring-1 ring-border"
              to={`/work-orders/${workOrder.id}`}
            >
              完整工单
            </Link>
          </div>
        </>
      )}
    </li>
  );
}
