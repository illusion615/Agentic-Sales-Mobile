import { AlertTriangle, ChevronDown, Clock, Route } from 'lucide-react';
import { overtimeMinutes, type DayPlan } from '@/domain/day-plan';
import {
  formatClock,
  formatDistance,
  formatDuration,
  formatProjectedClock,
} from '@/lib/duration';

const CONFIDENCE_NOTE: Record<DayPlan['travelConfidence'], string> = {
  road: '按高德实时路况计算行车时间',
  estimate: '部分路段无路线数据，按直线距离估算',
  unknown: '存在未定位工单，其行车时间未计入',
};

/**
 * Whether the day's list is actually a day's work.
 *
 * A count of open jobs says nothing about feasibility, so this states the
 * finish time the plan really implies and names the jobs that fall off the end.
 * It reports; it does not silently drop work or reschedule on the technician's
 * behalf.
 */
export function DayPlanSummary({
  plan,
  loading = false,
  compact = false,
  expanded = true,
  onToggle,
  className,
}: {
  plan: DayPlan;
  loading?: boolean;
  compact?: boolean;
  /** Collapsed leaves only the verdict, keeping the map readable. */
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const overtime = overtimeMinutes(plan);
  const fits = plan.overflow.length === 0;

  const verdict = (
    <>
      <p className="text-sm font-semibold text-foreground">
        今日可完成 {plan.completable.length} / {plan.stops.length}
      </p>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
          fits
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
        }`}
      >
        {fits ? '可当日完成' : `超出 ${formatDuration(overtime)}`}
      </span>
    </>
  );

  return (
    <section
      className={`rounded-2xl bg-card/95 p-3 text-xs shadow-md ring-1 ring-border ${className ?? ''}`}
      aria-label="今日排程可行性"
    >
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center gap-2"
        >
          {verdict}
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">{verdict}</div>
      )}

      {expanded && (
        <>
          <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            预计 {formatProjectedClock(plan.projectedFinish, plan.shiftEnd)} 收工 · 班次至{' '}
            {formatClock(plan.shiftEnd)}
          </p>

          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <Route className="h-3.5 w-3.5 shrink-0" />
            行车 {formatDuration(plan.totals.travelMinutes)} ·{' '}
            {formatDistance(plan.totals.travelKm)} · 现场{' '}
            {formatDuration(plan.totals.onSiteMinutes)} · 缓冲{' '}
            {formatDuration(
              plan.totals.bufferMinutes +
                plan.totals.travelBufferMinutes +
                plan.totals.breakMinutes,
            )}
          </p>

          {plan.overflow.length > 0 && (
            <p className="mt-1.5 flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {compact
                  ? `${plan.overflow.length} 个工单需改期或转派，列表中已标记`
                  : `建议改期：${plan.overflow.map((stop) => stop.workOrder.number).join('、')}`}
              </span>
            </p>
          )}

          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
            顺序按 SLA 优先、同级就近 ·{' '}
            {loading ? '正在获取实时路线…' : CONFIDENCE_NOTE[plan.travelConfidence]}
          </p>
        </>
      )}
    </section>
  );
}
