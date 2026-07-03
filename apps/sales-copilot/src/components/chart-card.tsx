import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip, PieChart, Pie, LineChart, Line } from 'recharts';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompactAmount, entityRoute, type ChartCardData, type BucketRecord } from '@/lib/chart-aggregation';

const FALLBACK_PALETTE = ['#008a7a', '#2d6cdf', '#17a899', '#4e84ea', '#006d61', '#1f57bd'];
const OTHER_COLOR = '#94a3b8';

/** Read the current color theme's palette (primary/accent shades) as resolved
 *  hex — theme-consistent AND legacy-WebView safe (no CSS vars reach the SVG). */
function readThemePalette(): string[] {
  if (typeof document === 'undefined') return FALLBACK_PALETTE;
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string) => cs.getPropertyValue(n).trim();
  const vars = ['--theme-primary', '--theme-accent', '--theme-primary-light', '--theme-accent-light', '--theme-primary-dark', '--theme-accent-dark'];
  const out = vars.map(g).filter((c) => /^#|^rgb/.test(c));
  return out.length >= 2 ? out : FALLBACK_PALETTE;
}

/** Theme palette that re-reads when the user switches color theme. */
function useThemePalette(): string[] {
  const [pal, setPal] = useState<string[]>(() => readThemePalette());
  useEffect(() => {
    const handler = () => setPal(readThemePalette());
    window.addEventListener('colortheme-changed', handler);
    return () => window.removeEventListener('colortheme-changed', handler);
  }, []);
  return pal;
}

/** Display width: CJK glyphs count double so the horizontal-vs-vertical choice
 *  and truncation reflect actual rendered width. */
function dispWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return w;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

interface ChartCardProps {
  chartCard: ChartCardData;
  locale: 'zh-Hans' | 'en';
}

/**
 * Interactive chart segment. The agent supplies only the DATA (grounded buckets)
 * and the rendering choice (bar / donut / line); this fixed renderer draws it in
 * the user's current theme colors — horizontal bars when the category labels are
 * long — and wires the closed loop:
 *   tap a bar / slice / point -> inline-expand that group's member records
 *   (the "Other" bucket expands into its folded groups, each drillable)
 *   tap a record -> navigate to its detail page (route by entity kind).
 */
export function ChartCard({ chartCard, locale }: ChartCardProps) {
  const navigate = useNavigate();
  const palette = useThemePalette();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const isZh = locale === 'zh-Hans';
  const metric = chartCard.metric;
  const isDonut = chartCard.type === 'donut';
  const isLine = chartCard.type === 'line';

  const fmt = (v: number) => (metric === 'amount' ? formatCompactAmount(v) : String(v));
  const metricLabel = metric === 'amount' ? (isZh ? '金额' : 'Amount') : (isZh ? '数量' : 'Count');
  const colorAt = (i: number, isOther?: boolean) => (isOther ? OTHER_COLOR : palette[i % palette.length]);
  const lineColor = palette[0] ?? FALLBACK_PALETTE[0];

  // Long category names (accounts, owners, ...) read far better as horizontal bars.
  const maxLabelW = Math.max(1, ...chartCard.buckets.map((b) => dispWidth(b.label)));
  const horizontal = !isDonut && !isLine && (maxLabelW > 9 || chartCard.buckets.length > 8);
  const chartHeight = horizontal ? Math.max(150, chartCard.buckets.length * 34 + 24) : 200;

  const data = chartCard.buckets.map((b, i) => ({
    key: b.key,
    name: b.label,
    value: metric === 'amount' ? b.amount : b.count,
    color: colorAt(i, b.isOther),
  }));
  // recharts renders the first data entry at the top in horizontal mode, and the
  // buckets are already in their intended order (value-desc / funnel / chrono).
  const chartData = data;

  const expandedBucket = chartCard.buckets.find((b) => b.key === expanded) ?? null;
  const expandedColor = expandedBucket
    ? colorAt(chartCard.buckets.indexOf(expandedBucket), expandedBucket.isOther)
    : OTHER_COLOR;
  const toggle = (key: string | undefined) => {
    if (!key) return;
    setExpandedSub(null);
    setExpanded((cur) => (cur === key ? null : key));
  };
  const pickKey = (d: unknown) => {
    const p = d as { key?: string; payload?: { key?: string } };
    return p?.key ?? p?.payload?.key;
  };

  const renderRecord = (r: BucketRecord, i: number) => (
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
  );

  return (
    <div className="rounded-2xl border bg-card p-3 max-w-full">
      <div className="text-sm font-medium mb-2">{chartCard.title}</div>

      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer>
          {isDonut ? (
            <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <Tooltip formatter={(v) => [fmt(Number(v)), metricLabel]} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={1} cursor="pointer" onClick={(d) => toggle(pickKey(d))}>
                {data.map((b) => (
                  <Cell key={b.key} fill={b.color} fillOpacity={expanded && expanded !== b.key ? 0.35 : 1} />
                ))}
              </Pie>
            </PieChart>
          ) : isLine ? (
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              onClick={(s) => { const nm = (s as { activeLabel?: string })?.activeLabel; const b = chartCard.buckets.find((x) => x.label === nm); toggle(b?.key); }}
            >
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={40} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [fmt(Number(v)), metricLabel]} />
              <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={{ r: 3, fill: lineColor }} activeDot={{ r: 5 }} />
            </LineChart>
          ) : horizontal ? (
            <BarChart layout="vertical" data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
              <XAxis type="number" tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => truncate(String(v), 10)} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} formatter={(v) => [fmt(Number(v)), metricLabel]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d) => toggle(pickKey(d))}>
                {chartData.map((b) => (
                  <Cell key={b.key} fill={b.color} fillOpacity={expanded && expanded !== b.key ? 0.35 : 1} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} axisLine={false} tickLine={false} tickFormatter={(v) => truncate(String(v), 6)} />
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
          {chartCard.buckets.map((b, i) => (
            <button
              key={b.key}
              type="button"
              onClick={() => toggle(b.key)}
              className={cn('flex items-center gap-1.5 text-[11px]', expanded && expanded !== b.key && 'opacity-50')}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorAt(i, b.isOther) }} />
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
            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: expandedColor }} />
            <span>{expandedBucket.label}</span>
            <span className="text-muted-foreground font-normal">
              {expandedBucket.count}{metric === 'amount' ? ` · ${formatCompactAmount(expandedBucket.amount)}` : ''}
            </span>
          </div>

          {expandedBucket.isOther && expandedBucket.subGroups && expandedBucket.subGroups.length ? (
            /* Other bucket: reveal the folded groups, each drillable to its records. */
            <div className="space-y-0.5">
              {expandedBucket.subGroups.map((sg) => (
                <div key={sg.key}>
                  <button
                    type="button"
                    onClick={() => setExpandedSub((cur) => (cur === sg.key ? null : sg.key))}
                    className="w-full text-left flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs hover:bg-muted active:bg-muted cursor-pointer"
                  >
                    <span className="min-w-0 flex-1 truncate">{sg.label}</span>
                    <span className="text-muted-foreground shrink-0">
                      {sg.count}{metric === 'amount' ? ` · ${formatCompactAmount(sg.amount)}` : ''}
                    </span>
                    <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', expandedSub === sg.key && 'rotate-90')} />
                  </button>
                  {expandedSub === sg.key && (
                    <div className="pl-3 space-y-0.5">{sg.records.map(renderRecord)}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">{expandedBucket.records.map(renderRecord)}</div>
          )}
        </div>
      )}
    </div>
  );
}
