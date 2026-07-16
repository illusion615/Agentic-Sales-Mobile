/**
 * Chart aggregation — grounded, general, agent-directed.
 *
 * The agent (analyzeResults) decides WHETHER a chart helps and picks the
 * DIMENSION / METRIC / TYPE from a fixed vocabulary. This module does the
 * grounding: it groups the ACTUAL fetched records by that dimension and
 * computes every number by code (never the LLM), keeping each group's member
 * records so a chart can drill straight down into them. Works for any entity
 * kind (opportunity / account / activity / contact), not just opportunities.
 */

import type { RecordEntityType } from '@/lib/record-route';

export type EntityKind = RecordEntityType;
export type ChartType = 'bar' | 'donut' | 'line';
export type ChartMetric = 'amount' | 'count';

/** What the agent emits: the DATA + rendering choice only — no numbers, no markup. */
export interface ChartSpec {
  type: ChartType;
  dimension: string;
  metric: ChartMetric;
  title?: string;
}

export interface BucketRecord {
  id: string;
  name: string;
  amount: number;
  subtitle: string;
  entity: EntityKind;
}

export interface ChartBucket {
  /** canonical group key */
  key: string;
  /** display label */
  label: string;
  count: number;
  /** sum of amount across the bucket's records */
  amount: number;
  /** true for the folded "Other" (Top-N tail) bucket */
  isOther?: boolean;
  /** for the Other bucket: the individual groups that were folded into it */
  subGroups?: ChartBucket[];
  records: BucketRecord[];
}

export interface ChartCardData {
  title: string;
  type: ChartType;
  metric: ChartMetric;
  buckets: ChartBucket[];
}

const STAGE_ORDER = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'];

const STAGE_LABEL: Record<string, { zh: string; en: string }> = {
  prospecting: { zh: '初步接触', en: 'Prospecting' },
  qualification: { zh: '资格认定', en: 'Qualification' },
  proposal: { zh: '方案报价', en: 'Proposal' },
  negotiation: { zh: '谈判', en: 'Negotiation' },
  won: { zh: '赢单', en: 'Won' },
  lost: { zh: '输单', en: 'Lost' },
};

const OTHER_KEY = '__other__';
const MAX_BUCKETS = 10;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Detect a record's entity kind from its own shape (robust for mixed sets). */
function entityOfRecord(o: Record<string, unknown>): EntityKind {
  if ('stage' in o || 'totalamount' in o) return 'opportunity';
  if ('subject' in o || 'activitytype' in o || 'scheduledstart' in o || 'actualstart' in o) return 'activity';
  if ('fullname' in o || 'firstname' in o || 'jobtitle' in o || 'emailaddress1' in o) return 'contact';
  return 'account';
}

function recordAmount(o: Record<string, unknown>): number {
  return num(o.amount) || num(o.totalamount) || num(o.value) || 0;
}

function recordName(o: Record<string, unknown>): string {
  return String(o.name ?? o.name1 ?? o.subject ?? o.fullname ?? o.title ?? o.topic ?? '');
}

function recordSubtitle(o: Record<string, unknown>): string {
  const acc = o.account;
  if (typeof acc === 'string' && acc) return acc;
  return String(asRecord(acc)?.name1 ?? o.accountName ?? o.accountname ?? o.jobtitle ?? '');
}

/** Resolve a record's group key+label for the chosen dimension, or null when
 *  the dimension is absent on this record. */
function dimensionOf(
  o: Record<string, unknown>,
  dimension: string,
  locale: 'zh-Hans' | 'en',
): { key: string; label: string } | null {
  const dim = dimension.trim().toLowerCase();

  // Stage (opportunities) — canonical funnel label.
  if (dim === 'stage' || dim === 'stagekey' || dim === 'pipeline') {
    const s = typeof o.stage === 'string' ? o.stage.toLowerCase() : '';
    if (!s) return null;
    const lbl = STAGE_LABEL[s];
    return { key: s, label: lbl ? (locale === 'zh-Hans' ? lbl.zh : lbl.en) : s };
  }
  // Account — may be a plain string (LLM view shape) or a nested relation.
  if (dim === 'account' || dim === 'accountname' || dim === 'customer' || dim === 'client') {
    const acc = o.account;
    const a = typeof acc === 'string' ? acc
      : String(asRecord(acc)?.name1 ?? asRecord(acc)?.name ?? o.accountName ?? o.accountname ?? '');
    return a ? { key: a.toLowerCase(), label: a } : null;
  }
  // Time distribution → YYYY-MM from the most relevant date field.
  if (dim === 'month' || dim === 'closemonth' || dim === 'time' || dim.includes('date')) {
    const raw = o.expectedCloseDate ?? o.expectedclosedate ?? o.scheduledStart ?? o.scheduledstart
      ?? o.actualStart ?? o.actualstart ?? o.createdOn ?? o.createdon ?? o.closedon;
    const d = raw ? new Date(String(raw)) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: key };
  }
  // Generic categorical field.
  const v = o[dim];
  if (v == null || v === '') return null;
  if (typeof v === 'object') {
    const nested = String(asRecord(v)?.name1 ?? asRecord(v)?.name ?? '');
    return nested ? { key: nested.toLowerCase(), label: nested } : null;
  }
  const s = String(v);
  return { key: s.toLowerCase(), label: s };
}

/** Dimension keyword -> canonical field, for inferring a chart from the user's
 *  own phrasing when the agent did not emit an explicit chart spec. */
const DIMENSION_KEYWORDS: Array<{ re: RegExp; dim: string }> = [
  { re: /\b(accounts?|customers?|clients?)\b|客户|客戶|账户|帳戶/, dim: 'account' },
  { re: /\b(stages?|pipelines?|funnels?)\b|阶段|階段|管道|漏斗/, dim: 'stage' },
  { re: /\b(month|monthly|timeline|trend|over time)\b|按月|每月|月份|时间|時間|趋势|趨勢/, dim: 'month' },
  { re: /\b(owners?|reps?|salespersons?|assignees?)\b|负责人|負責人|所有者|销售员/, dim: 'owner' },
  { re: /\b(priorit(y|ies))\b|优先级|優先級/, dim: 'priority' },
  { re: /\b(types?|categor(y|ies))\b|类型|類型|类别|類別/, dim: 'type' },
  { re: /\b(status|state)\b|状态|狀態/, dim: 'status' },
  { re: /\b(industr(y|ies)|sectors?)\b|行业|行業/, dim: 'industry' },
  { re: /\b(cit(y|ies)|region|location|area)\b|地区|地區|城市|区域|區域/, dim: 'city' },
];

const DIM_TITLE: Record<string, { zh: string; en: string }> = {
  account: { zh: '按客户分布', en: 'By account' },
  stage: { zh: '按阶段分布', en: 'By stage' },
  month: { zh: '按月份分布', en: 'By month' },
  owner: { zh: '按负责人分布', en: 'By owner' },
  priority: { zh: '按优先级分布', en: 'By priority' },
  type: { zh: '按类型分布', en: 'By type' },
  status: { zh: '按状态分布', en: 'By status' },
  industry: { zh: '按行业分布', en: 'By industry' },
  city: { zh: '按地区分布', en: 'By region' },
};

function dimensionTitle(dimension: string, locale: 'zh-Hans' | 'en'): string {
  const t = DIM_TITLE[dimension.trim().toLowerCase()];
  return t ? (locale === 'zh-Hans' ? t.zh : t.en) : (locale === 'zh-Hans' ? '分布' : 'Distribution');
}

/**
 * Infer a chart spec from the user's own request when the agent did not emit one
 * — keeps charts reliable for breakdown asks ("by account", "by month", ...) while
 * still honouring the dimension the user named (never hardcoded to stage).
 */
export function inferChartFromRequest(text: string): ChartSpec | null {
  const raw = text || '';
  const t = raw.toLowerCase();
  let dim: string | null = null;
  for (const k of DIMENSION_KEYWORDS) {
    if (k.re.test(t) || k.re.test(raw)) { dim = k.dim; break; }
  }
  if (!dim) return null;
  const metric: ChartMetric = /how many|count|number of|# of/.test(t) || /数量|多少|个数|個數/.test(raw) ? 'count' : 'amount';
  const isTrend = /trend|over time|timeline|monthly/.test(t) || /趋势|趨勢|走势|走勢|按月|每月|月度/.test(raw) || dim === 'month';
  const isShare = /share|proportion|percent|composition|make ?up/.test(t) || /占比|比例|构成|構成/.test(raw);
  const type: ChartType = isTrend ? 'line' : isShare ? 'donut' : 'bar';
  return { type, dimension: dim, metric };
}

/**
 * Build a grounded chart card from real records + the agent's spec. Returns null
 * when the data is not chartable (dimension absent, fewer than 2 groups, etc.),
 * so the caller simply omits the chart.
 */
export function buildChartCard(
  records: unknown[],
  spec: ChartSpec,
  locale: 'zh-Hans' | 'en',
): ChartCardData | null {
  if (!records.length) return null;
  const dim = spec.dimension.trim().toLowerCase();
  const isStage = /^(stage|stagekey|pipeline)$/.test(dim);
  const isTime = dim === 'month' || dim === 'closemonth' || dim === 'time' || dim.includes('date') || spec.type === 'line';

  const map = new Map<string, ChartBucket>();
  for (const raw of records) {
    const o = asRecord(raw);
    if (!o) continue;
    const dv = dimensionOf(o, spec.dimension, locale);
    if (!dv) continue;
    if (!map.has(dv.key)) {
      map.set(dv.key, { key: dv.key, label: dv.label, count: 0, amount: 0, records: [] });
    }
    const b = map.get(dv.key)!;
    b.count += 1;
    b.amount += recordAmount(o);
    b.records.push({
      id: String(o.id ?? ''),
      name: recordName(o),
      amount: recordAmount(o),
      subtitle: recordSubtitle(o),
      entity: entityOfRecord(o),
    });
  }

  let buckets = [...map.values()];
  if (buckets.length < 2) return null;

  // Metric fallback: 'amount' asked but the data carries no money.
  let metric = spec.metric === 'amount' ? 'amount' : 'count' as ChartMetric;
  if (metric === 'amount' && buckets.every((b) => b.amount === 0)) metric = 'count';
  const val = (b: ChartBucket) => (metric === 'amount' ? b.amount : b.count);

  if (isStage) {
    const ord = (k: string) => (STAGE_ORDER.indexOf(k) < 0 ? 99 : STAGE_ORDER.indexOf(k));
    buckets.sort((a, b) => ord(a.key) - ord(b.key));
  } else if (isTime) {
    // Chronological order; keep every period (a trend needs the full timeline).
    buckets.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  } else {
    buckets.sort((a, b) => val(b) - val(a));
    // Cap to Top-N, folding the tail into an "Other" bucket (keeps drill-down).
    if (buckets.length > MAX_BUCKETS) {
      const head = buckets.slice(0, MAX_BUCKETS - 1);
      const tail = buckets.slice(MAX_BUCKETS - 1);
      head.push({
        key: OTHER_KEY,
        label: locale === 'zh-Hans' ? '其它' : 'Other',
        count: tail.reduce((s, b) => s + b.count, 0),
        amount: tail.reduce((s, b) => s + b.amount, 0),
        isOther: true,
        subGroups: tail,
        records: tail.flatMap((b) => b.records),
      });
      buckets = head;
    }
  }

  const type: ChartType = spec.type === 'donut' ? 'donut' : spec.type === 'line' ? 'line' : 'bar';
  return {
    title: (spec.title && spec.title.trim()) || dimensionTitle(spec.dimension, locale),
    type,
    metric,
    buckets,
  };
}

/** Compact money format without a currency symbol (data has no single currency). */
export function formatCompactAmount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(Math.round(n));
}
