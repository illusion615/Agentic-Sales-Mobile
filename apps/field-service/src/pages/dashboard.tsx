import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useDataCapabilities, useMyWorkOrders } from '@/hooks/use-work-orders';
import { assessSla, sortWorkOrders, suggestVisitOrder, type SortMode, type SlaState } from '@/domain/scheduling';
import type { WorkOrderSummary } from '@/domain/work-order';
import { isOutstanding } from '@/domain/work-order';
import { navigationUrl } from '@/lib/navigation';

const SORT_LABELS: Record<SortMode, string> = {
  sla: 'SLA 紧急度',
  promised: '承诺时间',
  distance: '距离',
  priority: '优先级',
};

const SLA_STYLES: Record<SlaState, { label: string; className: string }> = {
  breached: { label: '已超时', className: 'bg-rose-500/12 text-rose-600 dark:text-rose-300' },
  critical: { label: '紧急', className: 'bg-orange-500/12 text-orange-600 dark:text-orange-300' },
  'at-risk': { label: '有风险', className: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
  ok: { label: '正常', className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  none: { label: '无 SLA', className: 'bg-muted text-muted-foreground' },
};

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatRemaining(minutes: number | null): string {
  if (minutes === null) return '—';
  const abs = Math.abs(minutes);
  const text = abs >= 60 ? `${Math.floor(abs / 60)} 小时 ${abs % 60} 分` : `${abs} 分钟`;
  return minutes < 0 ? `已超 ${text}` : `剩余 ${text}`;
}

export function DashboardPage() {
  const range = useMemo(todayRange, []);
  const { data: allWorkOrders = [], isLoading } = useMyWorkOrders(range);
  const capabilities = useDataCapabilities();

  // The dashboard is a to-do list, so closed jobs drop out of it entirely.
  const workOrders = useMemo(() => allWorkOrders.filter(isOutstanding), [allWorkOrders]);

  const [sortMode, setSortMode] = useState<SortMode>('sla');
  const [planning, setPlanning] = useState(false);

  // A real deployment reads this from the device; the fixture starts downtown.
  const origin = useMemo(() => ({ latitude: 22.5431, longitude: 114.0579 }), []);

  const sorted = useMemo(
    () => sortWorkOrders(workOrders, sortMode, { origin }),
    [workOrders, sortMode, origin],
  );
  const plan = useMemo(
    () => (planning ? suggestVisitOrder(workOrders, { origin }) : null),
    [planning, workOrders, origin],
  );

  const breached = workOrders.filter((w) => assessSla(w).state === 'breached').length;

  return (
    <div className="app-shell mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">我的工单</h1>
          <p className="text-sm text-muted-foreground">
            {workOrders.length} 个待办{breached > 0 ? ` · ${breached} 个已超时` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">数据源：{capabilities.id}</span>
          <Link
            to="/settings"
            aria-label="设置"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground ring-1 ring-border"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            // A planned route IS an ordering, so it replaces sorting rather
            // than silently ignoring it.
            disabled={planning}
            onClick={() => setSortMode(mode)}
            className={`rounded-full px-3 py-1 text-sm disabled:opacity-40 ${
              sortMode === mode && !planning
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-foreground ring-1 ring-border'
            }`}
          >
            {SORT_LABELS[mode]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPlanning((v) => !v)}
          className={`rounded-full px-3 py-1 text-sm ${
            planning ? 'bg-accent text-accent-foreground' : 'bg-card text-primary ring-1 ring-border'
          }`}
        >
          {planning ? '退出排程' : '规划路线'}
        </button>
      </div>

      {!capabilities.selfScheduling && planning && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          当前数据源不支持自主改期，以下顺序仅供参考，需由调度确认。
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}

      <ol className="flex flex-col gap-3">
        {(plan ? plan.map((stop) => stop.workOrder) : sorted).map((workOrder, index) => (
          <WorkOrderCard
            key={workOrder.id}
            workOrder={workOrder}
            sequence={plan ? index + 1 : null}
            legKm={plan?.[index]?.legKm ?? null}
          />
        ))}
      </ol>
    </div>
  );
}

function WorkOrderCard({
  workOrder,
  sequence,
  legKm,
}: {
  workOrder: WorkOrderSummary;
  sequence: number | null;
  legKm: number | null;
}) {
  const sla = assessSla(workOrder);
  const style = SLA_STYLES[sla.state];

  return (
    <li className="glass-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {sequence !== null && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {sequence}
              </span>
            )}
            <h2 className="truncate font-medium text-foreground">{workOrder.customerName}</h2>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {workOrder.number} · {workOrder.incidentType ?? '未分类'}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{workOrder.address.line1}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${style.className}`}>{style.label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatRemaining(sla.minutesRemaining)}</span>
        <span>{legKm !== null ? `行程 ${legKm.toFixed(1)} km` : ''}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          to={`/work-orders/${workOrder.id}`}
        >
          查看详情
        </Link>
        <a
          className="rounded-lg bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-border"
          href={navigationUrl(workOrder.address)}
          target="_blank"
          rel="noopener noreferrer"
        >
          导航前往
        </a>
      </div>
    </li>
  );
}
