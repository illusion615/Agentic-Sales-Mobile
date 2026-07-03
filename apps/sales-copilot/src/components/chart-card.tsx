import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactAmount, type StageBucket } from '@/lib/pipeline-chart';

export interface ChartCardData {
  title: string;
  /** what the bar height encodes */
  metric: 'amount' | 'count';
  buckets: StageBucket[];
}

/** Fixed, audited color vocabulary — inline hex (no CSS vars) for legacy WebView safety. */
const STAGE_COLORS: Record<string, string> = {
  prospecting: '#94a3b8',
  qualification: '#60a5fa',
  proposal: '#818cf8',
  negotiation: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444',
  other: '#a1a1aa',
};

interface ChartCardProps {
  chartCard: ChartCardData;
  locale: 'zh-Hans' | 'en';
}

/**
 * Interactive pipeline chart. The LLM/runtime only supplies the DATA (buckets);
 * this fixed renderer draws the bars and wires the closed loop:
 *   tap a bar -> inline-expand that stage's member opportunities
 *   tap an opportunity -> navigate to its detail page.
 */
export function ChartCard({ chartCard, locale }: ChartCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const isZh = locale === 'zh-Hans';
  const metric = chartCard.metric;

  const data = chartCard.buckets.map((b) => ({
    stage: b.stage,
    name: b.label,
    value: metric === 'amount' ? b.amount : b.count,
  }));

  const fmt = (v: number) => (metric === 'amount' ? formatCompactAmount(v) : String(v));
  const expandedBucket = chartCard.buckets.find((b) => b.stage === expanded) ?? null;

  const toggle = (stage: string | undefined) => {
    if (!stage) return;
    setExpanded((cur) => (cur === stage ? null : stage));
  };

  return (
    <div className="rounded-2xl border bg-card p-3 max-w-full">
      <div className="text-sm font-medium mb-2">{chartCard.title}</div>

      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={40} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              formatter={(v) => [fmt(Number(v)), isZh ? '金额' : metric === 'amount' ? 'Amount' : 'Count']}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(d) => {
                const p = d as { stage?: string; payload?: { stage?: string } };
                toggle(p?.stage ?? p?.payload?.stage);
              }}
            >
              {data.map((b) => (
                <Cell
                  key={b.stage}
                  fill={STAGE_COLORS[b.stage] ?? STAGE_COLORS.other}
                  fillOpacity={expanded && expanded !== b.stage ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs text-muted-foreground mt-1">
        {isZh ? '点击柱状图查看该阶段的商机' : 'Tap a bar to see its opportunities'}
      </div>

      {expandedBucket && (
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center gap-2 text-xs font-medium mb-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: STAGE_COLORS[expandedBucket.stage] ?? STAGE_COLORS.other }}
            />
            <span>{expandedBucket.label}</span>
            <span className="text-muted-foreground font-normal">
              {expandedBucket.count} · {formatCompactAmount(expandedBucket.amount)}
            </span>
          </div>
          <div className="space-y-0.5">
            {expandedBucket.records.map((r, i) => (
              <button
                key={r.id || `${r.name}-${i}`}
                type="button"
                disabled={!r.id}
                onClick={() => r.id && navigate(`/opportunities/${r.id}`)}
                className={cn(
                  'w-full text-left flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs',
                  r.id ? 'hover:bg-muted active:bg-muted cursor-pointer' : 'opacity-70',
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.name || (isZh ? '(未命名)' : '(unnamed)')}
                  {r.account ? <span className="text-muted-foreground"> · {r.account}</span> : null}
                </span>
                <span className="font-medium shrink-0">{formatCompactAmount(r.amount)}</span>
                {r.id ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
