/**
 * Opportunity list — pure search / sort / lifecycle-grouping helpers for the
 * Pipeline page. Kept framework-free so the ordering rules are unit-tested and
 * shared, never re-derived inline.
 */
import type { Opportunity } from '@/generated/models/opportunity-model';

export type OpportunitySortKey = 'amount' | 'closeDate' | 'confidence' | 'name';

/** Canonical opportunity lifecycle order (探索→资质→方案→谈判). */
export const OPPORTUNITY_STAGE_ORDER = ['prospecting', 'qualification', 'proposal', 'negotiation'] as const;

/** Case-insensitive match on opportunity name OR account name. */
export function filterOpportunities<T extends Opportunity>(list: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return list;
  return list.filter((o) =>
    (o.name1 || '').toLowerCase().includes(q)
    || (o.account?.name1 || '').toLowerCase().includes(q));
}

/** Sort a copy of the list by the chosen key (does not mutate the input). */
export function sortOpportunities<T extends Opportunity>(list: T[], sortBy: OpportunitySortKey): T[] {
  const arr = [...list];
  switch (sortBy) {
    case 'amount':
      arr.sort((a, b) => (b.totalamount || 0) - (a.totalamount || 0));
      break;
    case 'closeDate':
      // Soonest first; missing dates sink to the bottom.
      arr.sort((a, b) =>
        new Date(a.expectedclosedate || '9999-12-31').getTime()
        - new Date(b.expectedclosedate || '9999-12-31').getTime());
      break;
    case 'confidence':
      // Lowest confidence (most at-risk) first.
      arr.sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
      break;
    case 'name':
      arr.sort((a, b) => (a.name1 || '').localeCompare(b.name1 || ''));
      break;
  }
  return arr;
}

export interface OpportunityStageGroup<T extends Opportunity = Opportunity> {
  stage: string;
  items: T[];
}

/**
 * Group opportunities by stage in lifecycle order. Any non-canonical stage is
 * appended after the four pipeline stages (order-preserving) so nothing is lost.
 */
export function groupOpportunitiesByStage<T extends Opportunity>(list: T[]): OpportunityStageGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const o of list) {
    const s = o.stage || 'prospecting';
    const bucket = groups.get(s);
    if (bucket) bucket.push(o);
    else groups.set(s, [o]);
  }
  const ordered: OpportunityStageGroup<T>[] = [];
  for (const s of OPPORTUNITY_STAGE_ORDER) {
    const items = groups.get(s);
    if (items && items.length) {
      ordered.push({ stage: s, items });
      groups.delete(s);
    }
  }
  for (const [stage, items] of groups) ordered.push({ stage, items });
  return ordered;
}
