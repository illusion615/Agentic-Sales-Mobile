import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRecordAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
  retrieveRecordAsync: vi.fn(),
  retrieveMultipleRecordsAsync: vi.fn(),
  executeAsync: vi.fn(),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => mocks,
}));

import { ActivityService } from '@/generated/services/activity-service';

describe('ActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecordAsync.mockResolvedValue({
      success: true,
      data: {
        activityid: 'activity-1',
        subject: 'Cleveland Clinic - Visit',
        scheduledstart: '2026-06-08',
        statecode: 0,
        _regardingobjectid_value: 'account-1',
        regardingobjectidtypecode: 'account',
        regardingobjectidname: 'Cleveland Clinic',
      },
    });
  });

  it('binds activities with app opportunities to the custom opportunity regarding target', async () => {
    await ActivityService.create({
      title: 'Cleveland Clinic - Visit',
      type: 'visit',
      scheduleddate: '2026-06-08',
      status: 'open',
      ownerid: 'user-1',
      account: { id: 'account-1', name1: 'Cleveland Clinic' },
      opportunity: { id: 'custom-opportunity-1', name1: 'new operation room project' },
    });

    expect(mocks.createRecordAsync).toHaveBeenCalledWith(
      'appointments',
      expect.objectContaining({
        'regardingobjectid_crf5c_opportunity1@odata.bind': '/crf5c_opportunity1s(custom-opportunity-1)',
      }),
    );
    const payload = mocks.createRecordAsync.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('regardingobjectid_opportunity@odata.bind');
    expect(payload).not.toHaveProperty('regardingobjectid_account@odata.bind');
  });

  it('writes call contacts as activity parties instead of regarding targets', async () => {
    await ActivityService.create({
      title: 'Call Dr. Taylor',
      type: 'call',
      scheduleddate: '2026-06-08',
      status: 'open',
      ownerid: 'user-1',
      account: { id: 'account-1', name1: 'Cleveland Clinic' },
      contact: { id: 'contact-1', fullname: 'Dr. Taylor' },
    });

    expect(mocks.createRecordAsync).toHaveBeenCalledWith(
      'phonecalls',
      expect.objectContaining({
        'regardingobjectid_account@odata.bind': '/accounts(account-1)',
        phonecall_activity_parties: [
          {
            'partyid_contact@odata.bind': '/contacts(contact-1)',
            participationtypemask: 2,
          },
        ],
      }),
    );
  });
});