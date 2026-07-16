import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AISummaryService } from '@/generated/services/ai-summary-service';

const mocks = vi.hoisted(() => ({
  createRecordAsync: vi.fn(),
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  retrieveRecordAsync: vi.fn(),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => ({
    createRecordAsync: mocks.createRecordAsync,
    retrieveMultipleRecordsAsync: mocks.retrieveMultipleRecordsAsync,
    updateRecordAsync: mocks.updateRecordAsync,
    retrieveRecordAsync: mocks.retrieveRecordAsync,
  }),
}));

describe('AISummaryService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses entity id and type when reading back a hosted 204 create', async () => {
    mocks.createRecordAsync.mockResolvedValue({ success: true, data: undefined });
    mocks.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true,
      data: [{
        crf5c_aisummaryid: 'summary-marketing',
        crf5c_entityid: 'account-1',
        crf5c_entitytype: 995340000,
        crf5c_status: 995340002,
        crf5c_summary: 'Marketing facts',
        biz_type: 'marketing',
      }],
    });

    const result = await AISummaryService.create({
      entityID: 'account-1',
      entityType: 'account',
      status: 'completed',
      summary: 'Marketing facts',
      type: 'marketing',
    });

    expect(mocks.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
      'crf5c_aisummaries',
      expect.objectContaining({
        filter: "crf5c_entityid eq 'account-1' and biz_type eq 'marketing'",
      }),
    );
    expect(result.id).toBe('summary-marketing');
  });

  it('reads the updated row when the hosted SDK returns success without a body', async () => {
    mocks.updateRecordAsync.mockResolvedValue({ success: true, data: undefined });
    mocks.retrieveRecordAsync.mockResolvedValue({
      success: true,
      data: {
        crf5c_aisummaryid: 'summary-1',
        crf5c_entityid: 'account-1',
        crf5c_entitytype: 995340000,
        crf5c_status: 995340002,
        crf5c_summary: '**Industry trends:** Updated',
        biz_type: 'marketing',
      },
    });

    const result = await AISummaryService.update('summary-1', {
      summary: '**Industry trends:** Updated',
      status: 'completed',
    });

    expect(mocks.updateRecordAsync).toHaveBeenCalledWith(
      'crf5c_aisummaries',
      'summary-1',
      {
        crf5c_status: 995340002,
        crf5c_summary: '**Industry trends:** Updated',
      },
    );
    expect(mocks.retrieveRecordAsync).toHaveBeenCalledWith('crf5c_aisummaries', 'summary-1', undefined);
    expect(result).toEqual(expect.objectContaining({
      id: 'summary-1',
      entityID: 'account-1',
      entityType: 'account',
      status: 'completed',
      type: 'marketing',
    }));
  });
});
