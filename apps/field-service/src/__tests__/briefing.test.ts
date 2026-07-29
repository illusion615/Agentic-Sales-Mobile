import { describe, expect, it } from 'vitest';
import { createRuleBasedBriefingProvider } from '@/data/local/briefing-provider';
import { recentFirst, recurringIncidents } from '@/domain/briefing';
import type { CustomerProfile, ServiceHistoryEntry } from '@/domain/customer';
import type { WorkOrderDetail } from '@/domain/work-order';

const customer: CustomerProfile = {
  id: 'acc-1',
  name: '南山人民医院',
  siteAccessNotes: '设备科在住院楼 B1，需登记。',
  cautions: ['血透室为洁净区'],
  contacts: [{ name: '王主任', role: '设备科主任', phone: '13800000001' }],
};

const workOrder: WorkOrderDetail = {
  id: 'wo-1',
  number: 'WO-1',
  status: 'scheduled',
  priority: 'high',
  incidentType: '透析机停机',
  customerId: 'acc-1',
  customerName: customer.name,
  address: { line1: 'somewhere' },
  summary: '设备报警停机。',
  assetName: '透析机 DX-200 #3',
};

function historyEntry(overrides: Partial<ServiceHistoryEntry> & { id: string }): ServiceHistoryEntry {
  return {
    workOrderNumber: 'WO-0',
    completedOn: '2026-01-01T00:00:00.000Z',
    incidentType: '透析机停机',
    resolution: '更换传感器。',
    ...overrides,
  };
}

describe('history helpers', () => {
  it('orders history newest first', () => {
    const ordered = recentFirst([
      historyEntry({ id: 'old', completedOn: '2026-01-01T00:00:00.000Z' }),
      historyEntry({ id: 'new', completedOn: '2026-06-01T00:00:00.000Z' }),
    ]);
    expect(ordered.map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('finds only repeats of the same fault', () => {
    const repeats = recurringIncidents(
      [historyEntry({ id: 'a' }), historyEntry({ id: 'b', incidentType: '预防性维护' })],
      '透析机停机',
    );
    expect(repeats.map((e) => e.id)).toEqual(['a']);
  });

  it('treats an unclassified job as having no repeats', () => {
    expect(recurringIncidents([historyEntry({ id: 'a' })], undefined)).toEqual([]);
  });
});

describe('rule-based briefing', () => {
  const provider = createRuleBasedBriefingProvider();

  it('declares that it was not written by a model', async () => {
    const briefing = await provider.generate({ workOrder, customer, history: [] });
    expect(briefing.source).toBe('rules');
  });

  it('flags a repeat fault and calls for root-cause work', async () => {
    const briefing = await provider.generate({
      workOrder,
      customer,
      history: [historyEntry({ id: 'a' }), historyEntry({ id: 'b' })],
    });

    expect(briefing.background).toContain('重复出现 2 次');
    expect(briefing.watchOuts.some((w) => w.includes('根因'))).toBe(true);
  });

  it('says plainly when there is no history instead of implying experience', async () => {
    const briefing = await provider.generate({ workOrder, customer, history: [] });
    expect(briefing.background).toContain('暂无历史服务记录');
  });

  it('carries site access rules and standing cautions into the watch-outs', async () => {
    const briefing = await provider.generate({ workOrder, customer, history: [] });
    expect(briefing.watchOuts).toContain('设备科在住院楼 B1，需登记。');
    expect(briefing.watchOuts).toContain('血透室为洁净区');
  });

  it('grounds preparation in the last resolution and the primary contact', async () => {
    const briefing = await provider.generate({
      workOrder,
      customer,
      history: [historyEntry({ id: 'a', resolution: '更换电导率传感器。' })],
    });

    expect(briefing.preparation.some((p) => p.includes('更换电导率传感器'))).toBe(true);
    expect(briefing.preparation.some((p) => p.includes('王主任'))).toBe(true);
  });
});
