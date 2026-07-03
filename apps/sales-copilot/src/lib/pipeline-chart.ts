/**
 * Pipeline chart aggregation.
 *
 * Deterministic: turns the ACTUAL opportunity records a query returned into
 * per-stage buckets. Numbers are computed here (never by the LLM), and each
 * bucket KEEPS its member records so a chart segment can drill down into the
 * exact opportunities behind it — the chart, its drill-down list and the record
 * detail are all views of the same fetched record set (grounding + closed loop).
 */

export interface StageBucketRecord {
  id: string;
  name: string;
  amount: number;
  account: string;
}

export interface StageBucket {
  /** canonical stage key, e.g. 'negotiation' */
  stage: string;
  /** localized display label */
  label: string;
  count: number;
  /** sum of totalamount across the bucket's records */
  amount: number;
  records: StageBucketRecord[];
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Heuristic: does this record set look like opportunities (has a stage + an amount)? */
export function looksLikeOpportunities(records: unknown[]): boolean {
  const first = records.map(asRecord).find(Boolean);
  return !!first && 'stage' in first && ('totalamount' in first || 'amount' in first);
}

/**
 * Aggregate opportunity records into funnel-ordered stage buckets, preserving
 * each stage's member records for drill-down.
 */
export function aggregateOpportunitiesByStage(
  records: unknown[],
  locale: 'zh-Hans' | 'en',
): StageBucket[] {
  const byStage = new Map<string, StageBucket>();
  for (const raw of records) {
    const o = asRecord(raw);
    if (!o) continue;
    const stage = typeof o.stage === 'string' && o.stage.trim() ? o.stage.toLowerCase() : 'other';
    const amount = typeof o.totalamount === 'number' ? o.totalamount
      : typeof o.amount === 'number' ? o.amount : 0;
    const name = String(o.name1 ?? o.name ?? '');
    const account = String(asRecord(o.account)?.name1 ?? o.accountName ?? '');
    const id = String(o.id ?? '');
    if (!byStage.has(stage)) {
      const lbl = STAGE_LABEL[stage];
      byStage.set(stage, {
        stage,
        label: lbl ? (locale === 'zh-Hans' ? lbl.zh : lbl.en) : stage,
        count: 0,
        amount: 0,
        records: [],
      });
    }
    const b = byStage.get(stage)!;
    b.count += 1;
    b.amount += amount;
    b.records.push({ id, name, amount, account });
  }
  return [...byStage.values()].sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a.stage);
    const ib = STAGE_ORDER.indexOf(b.stage);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/** Compact money format without a currency symbol (data has no single currency). */
export function formatCompactAmount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(Math.round(n));
}
