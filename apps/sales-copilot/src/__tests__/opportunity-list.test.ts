import { describe, expect, it } from 'vitest';
import {
  filterOpportunities,
  sortOpportunities,
  groupOpportunitiesByStage,
  OPPORTUNITY_STAGE_ORDER,
} from '@/lib/opportunity-list';
import type { Opportunity } from '@/generated/models/opportunity-model';

function opp(partial: Partial<Opportunity>): Opportunity {
  return {
    id: partial.id || Math.random().toString(36).slice(2),
    name1: partial.name1 || 'Opp',
    stage: partial.stage || 'prospecting',
    totalamount: partial.totalamount ?? 0,
    confidence: partial.confidence,
    expectedclosedate: partial.expectedclosedate,
    account: partial.account,
    ownerid: '',
  } as Opportunity;
}

describe('filterOpportunities', () => {
  const list = [
    opp({ name1: 'Monitor upgrade', account: { id: 'a', name1: 'Royal London' } }),
    opp({ name1: 'CT scanner', account: { id: 'b', name1: 'Cedars-Sinai' } }),
  ];
  it('matches on opportunity name (case-insensitive)', () => {
    expect(filterOpportunities(list, 'monitor')).toHaveLength(1);
  });
  it('matches on account name', () => {
    expect(filterOpportunities(list, 'cedars')).toHaveLength(1);
  });
  it('returns all for empty query', () => {
    expect(filterOpportunities(list, '   ')).toHaveLength(2);
  });
});

describe('sortOpportunities', () => {
  const list = [
    opp({ name1: 'B', totalamount: 100, confidence: 80, expectedclosedate: '2026-09-01' }),
    opp({ name1: 'A', totalamount: 500, confidence: 20, expectedclosedate: '2026-08-01' }),
    opp({ name1: 'C', totalamount: 300, confidence: 50 }),
  ];
  it('amount: highest first', () => {
    expect(sortOpportunities(list, 'amount').map((o) => o.totalamount)).toEqual([500, 300, 100]);
  });
  it('confidence: lowest (most at-risk) first', () => {
    expect(sortOpportunities(list, 'confidence').map((o) => o.confidence)).toEqual([20, 50, 80]);
  });
  it('closeDate: soonest first, missing dates last', () => {
    expect(sortOpportunities(list, 'closeDate').map((o) => o.name1)).toEqual(['A', 'B', 'C']);
  });
  it('name: alphabetical', () => {
    expect(sortOpportunities(list, 'name').map((o) => o.name1)).toEqual(['A', 'B', 'C']);
  });
  it('does not mutate the input', () => {
    const before = list.map((o) => o.name1);
    sortOpportunities(list, 'amount');
    expect(list.map((o) => o.name1)).toEqual(before);
  });
});

describe('groupOpportunitiesByStage', () => {
  it('orders groups by the opportunity lifecycle regardless of input order', () => {
    const list = [
      opp({ stage: 'negotiation' }),
      opp({ stage: 'prospecting' }),
      opp({ stage: 'proposal' }),
      opp({ stage: 'qualification' }),
    ];
    expect(groupOpportunitiesByStage(list).map((g) => g.stage)).toEqual([...OPPORTUNITY_STAGE_ORDER]);
  });
  it('omits empty stages and appends non-canonical stages last', () => {
    const list = [opp({ stage: 'proposal' }), opp({ stage: 'weird' }), opp({ stage: 'prospecting' })];
    expect(groupOpportunitiesByStage(list).map((g) => g.stage)).toEqual(['prospecting', 'proposal', 'weird']);
  });
});
