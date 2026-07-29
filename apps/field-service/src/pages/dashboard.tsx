import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  breached: { label: '已超时', className: 'bg-rose-100 text-rose-700' },
  critical: { label: '紧急', className: 'bg-orange-100 text-orange-700' },
  'at-risk': { label: '有风险', className: 'bg-amber-100 text-amber-700' },
  ok: { label: '正常', className: 'bg-emerald-100 text-emerald-700' },
  none: { label: '无 SLA', className: 'bg-slate-100 text-slate-600' },
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
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 bg-slate-50 p-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">我的工单</h1>
          <p className="text-sm text-slate-500">
            {workOrders.length} 个待办{breached > 0 ? ` · ${breached} 个已超时` : ''}
          </p>
        </div>
        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-600">
          数据源：{capabilities.id}
        </span>
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
              sortMode === mode && !planning ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
            }`}
          >
            {SORT_LABELS[mode]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPlanning((v) => !v)}
          className={`rounded-full px-3 py-1 text-sm ${
            planning ? 'bg-blue-600 text-white' : 'bg-white text-blue-700'
          }`}
        >
          {planning ? '退出排程' : '规划路线'}
        </button>
      </div>

      {!capabilities.selfScheduling && planning && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          当前数据源不支持自主改期，以下顺序仅供参考，需由调度确认。
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">加载中…</p>}

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
    <li className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {sequence !== null && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                {sequence}
              </span>
            )}
            <h2 className="truncate font-medium text-slate-900">{workOrder.customerName}</h2>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {workOrder.number} · {workOrder.incidentType ?? '未分类'}
          </p>
          <p className="mt-1 truncate text-sm text-slate-500">{workOrder.address.line1}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${style.className}`}>{style.label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{formatRemaining(sla.minutesRemaining)}</span>
        <span>{legKm !== null ? `行程 ${legKm.toFixed(1)} km` : ''}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
          to={`/work-orders/${workOrder.id}`}
        >
          查看详情
        </Link>
        <a
          className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200"
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
