import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRecordAsync } = vi.hoisted(() => ({
  createRecordAsync: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => ({ createRecordAsync }),
}));

vi.mock('@microsoft/power-apps/app', () => ({
  getContext: vi.fn().mockResolvedValue({
    user: {
      objectId: 'ABCDEFAB-1234-5678-90AB-ABCDEFABCDEF',
      fullName: 'Test Sales User',
      userPrincipalName: 'test.user@example.com',
    },
  }),
}));

import { recordStandaloneAiOperation } from '@/lib/ai-cost-log';

describe('recordStandaloneAiOperation', () => {
  beforeEach(() => createRecordAsync.mockClear());

  it('writes one sole operation row with trace metadata and no AI response', async () => {
    const traceId = '11111111-2222-4333-8444-555555555555';
    recordStandaloneAiOperation({
      operationType: 'report.weekly',
      queryText: 'Weekly report · Jul 6 – Jul 12',
      traceId,
    });

    await vi.waitFor(() => expect(createRecordAsync).toHaveBeenCalledOnce());
    const [dataSource, row] = createRecordAsync.mock.calls[0] as [string, Record<string, unknown>];
    expect(dataSource).toBe('crf5c_agentlogs');
    expect(row.biz_operationtype).toBe('report.weekly');
    expect(row.biz_allocationmethod).toBe('sole');
    expect(row.crf5c_userid).toBe('abcdefab-1234-5678-90ab-abcdefabcdef');
    expect(row.crf5c_username).toBe('Test Sales User');
    expect(row.crf5c_querytext).toBe('Weekly report · Jul 6 – Jul 12');
    expect(JSON.parse(row.biz_aieventtracelist as string)).toEqual({
      v: 1,
      traces: [traceId],
      divisor: 1,
    });
    expect(row).not.toHaveProperty('crf5c_responsetext');
  });
});