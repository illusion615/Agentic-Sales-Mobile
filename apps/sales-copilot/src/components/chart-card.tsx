import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip, PieChart, Pie } from 'recharts';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactAmount, entityRoute, type ChartCardData } from '@/lib/chart-aggregation';

interface ChartCardProps {
  chartCard: ChartCardData;
  locale: 'zh-Hans' | 'en';
}

/**
 * Interactive chart segment. The agent supplies only the DATA (grounded buckets)
 * and the rendering choice (bar / donut); this fixed renderer draws it and wires
 * the closed loop:
 *   tap a bar / slice -> inline-expand that group's member records
 *   tap a record -> navigate to its detail page (route by entity kind).
 */
export function ChartCard({ chartCard, locale }: ChartCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const isZh = locale === 'zh-Hans';
  const metric = chartCard.metric;
  const isDonut = chartCard.type === 'donut';

  const fmt = (v: number) => (metric === 'amount' ? formatCompactAmount(v) : String(v));
  const metricLabel = metric === 'amount' ? (isZh ? '金额' : 'Amount') : (isZh ? '数量' : 'Count');

  const data = chartCard.buckets.map((b) => ({
    key: b.key,
    name: b.label,
    value: metric === 'amount' ? b.amount : b.count,
    color: b.color,
  }));

  const expandedBucket = chartCard.buckets.find((b) => b.key === expanded) ?? null;
  const toggle = (key: string | undefined) => {
    if (!key) return;
    setExpanded((cur) => (cur === key ? null : key));
  };
  const pickKey = (d: unknown) => {
    const p = d as { key?: string; payload?: { key?: string } };
    return p?.key ?? p?.payload?.key;
  };

  return (
    <div className="rounded-2xl border bg-card p-3 max-w-full">
      <div className="text-sm font-medium mb-2">{chartCard.title}</div>

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          {isDonut ? (
            <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <Tooltip formatter={(v) => [fmt(Number(v)), metricLabel]} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={82}
                paddingAngle={1}
                cursor="pointer"
                onClick={(d) => toggle(pickKey(d))}
              >
                {data.map((b) => (
                  <Cell key={b.key} fill={b.color} fillOpacity={expanded && expanded !== b.key ? 0.35 : 1} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => { const s = String(v); return s.length > 6 ? s.slice(0, 6) + '…' : s; }}
              />
              <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={40} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v) => [fmt(Number(v)), metricLabel]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => toggle(pickKey(d))}>
                {data.map((b) => (
                  <Cell key={b.key} fill={b.color} fillOpacity={expanded && expanded !== b.key ? 0.35 : 1} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Donut has no axis labels — render a compact, tappable legend. */}
      {isDonut && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {chartCard.buckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => toggle(b.key)}
              className={cn('flex items-center gap-1.5 text-[11px]', expanded && expanded !== b.key && 'opacity-50')}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
              <span className="truncate max-w-[120px]">{b.label}</span>
              <span className="text-muted-foreground">{fmt(metric === 'amount' ? b.amount : b.count)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-1">
        {isZh ? '点击图表查看明细' : 'Tap the chart to see the records'}
      </div>

      {expandedBucket && (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center gap-2 text-xs font-medium mb-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: expandedBucket.color }} />
            <span>{expandedBucket.label}</span>
            <span className="text-muted-foreground font-normal">
              {expandedBucket.count}{metric === 'amount' ? ` · ${formatCompactAmount(expandedBucket.amount)}` : ''}
            </span>
          </div>
          <div className="space-y-0.5">
            {expandedBucket.records.map((r, i) => (
              <button
                key={r.id || `${r.name}-${i}`}
                type="button"
                disabled={!r.id}
                onClick={() => r.id && navigate(entityRoute(r.entity, r.id))}
                className={cn(
                  'w-full text-left flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs',
                  r.id ? 'hover:bg-muted active:bg-muted cursor-pointer' : 'opacity-70',
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.name || (isZh ? '(未命名)' : '(unnamed)')}
                  {r.subtitle ? <span className="text-muted-foreground"> · {r.subtitle}</span> : null}
                </span>
                {metric === 'amount' && r.amount ? <span className="font-medium shrink-0">{formatCompactAmount(r.amount)}</span> : null}
                {r.id ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
