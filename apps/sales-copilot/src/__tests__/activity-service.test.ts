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

  it('creates a completed call as Open then transitions it to Made', async () => {
    mocks.updateRecordAsync.mockResolvedValue({ success: true, data: undefined });

    const created = await ActivityService.create({
      title: '[E2E] Completed call',
      type: 'call',
      scheduleddate: '2026-07-14',
      status: 'completed',
      ownerid: 'user-1',
    });

    expect(mocks.createRecordAsync).toHaveBeenCalledWith(
      'phonecalls',
      expect.objectContaining({ statecode: 0, statuscode: 1 }),
    );
    expect(mocks.updateRecordAsync).toHaveBeenCalledWith(
      'phonecalls',
      'activity-1',
      { statecode: 1, statuscode: 2 },
    );
    expect(created.status).toBe('completed');
  });

  it.each([
    ['visit', 'appointments', 1, 3],
    ['meeting', 'appointments', 1, 3],
    ['email', 'emails', 1, 3],
  ] as const)('creates a completed %s as Open then transitions the native table', async (
    type,
    table,
    openReason,
    completedReason,
  ) => {
    mocks.updateRecordAsync.mockResolvedValue({ success: true, data: undefined });

    await ActivityService.create({
      title: `[E2E] Completed ${type}`,
      type,
      scheduleddate: '2026-07-14',
      status: 'completed',
      ownerid: 'user-1',
    });

    expect(mocks.createRecordAsync).toHaveBeenCalledWith(
      table,
      expect.objectContaining({ statecode: 0, statuscode: openReason }),
    );
    expect(mocks.updateRecordAsync).toHaveBeenCalledWith(
      table,
      'activity-1',
      { statecode: 1, statuscode: completedReason },
    );
  });

  it('deletes the newly created Open activity when its completed transition fails', async () => {
    const transitionError = new Error('status transition rejected');
    mocks.updateRecordAsync.mockResolvedValue({ success: false, error: transitionError });
    mocks.deleteRecordAsync.mockResolvedValue(undefined);

    await expect(ActivityService.create({
      title: '[E2E] Compensated call',
      type: 'call',
      scheduleddate: '2026-07-14',
      status: 'completed',
      ownerid: 'user-1',
    })).rejects.toBe(transitionError);

    expect(mocks.deleteRecordAsync).toHaveBeenCalledWith('phonecalls', 'activity-1');
  });

  it('surfaces both transition and cleanup failures without newer runtime built-ins', async () => {
    const transitionError = new Error('status transition rejected');
    const cleanupError = new Error('compensation delete rejected');
    mocks.updateRecordAsync.mockResolvedValue({ success: false, error: transitionError });
    mocks.deleteRecordAsync.mockRejectedValue(cleanupError);

    const promise = ActivityService.create({
      title: '[E2E] Failed compensation call',
      type: 'call',
      scheduleddate: '2026-07-14',
      status: 'completed',
      ownerid: 'user-1',
    });

    await expect(promise).rejects.toMatchObject({
      message: 'Activity activity-1 could not transition to completed, and compensation delete failed',
      transitionError,
      cleanupError,
    });
  });

  it('recovers the id via read-back when create returns an empty body (mobile 204)', async () => {
    // The mobile native player returns success with NO representation body,
    // so the create result omits the primary key even though the row exists.
    mocks.createRecordAsync.mockResolvedValueOnce({ success: true, data: undefined });
    mocks.retrieveMultipleRecordsAsync.mockResolvedValueOnce({
      success: true,
      data: [
        {
          activityid: 'appointment-42',
          subject: '完成给金唯智的相关方案',
          scheduledstart: '2026-07-19T14:00:00Z',
          statecode: 0,
          _regardingobjectid_value: 'account-1',
          regardingobjectidtypecode: 'account',
          regardingobjectidname: '金唯智',
        },
      ],
    });

    const created = await ActivityService.create({
      title: '完成给金唯智的相关方案',
      type: 'meeting',
      scheduleddate: '2026-07-19T14:00:00Z',
      status: 'open',
      ownerid: 'user-1',
      account: { id: 'account-1', name1: '金唯智' },
    });

    expect(created.id).toBe('appointment-42');
    expect(mocks.retrieveMultipleRecordsAsync).toHaveBeenCalledWith(
      'appointments',
      expect.objectContaining({ filter: "subject eq '完成给金唯智的相关方案'" }),
    );
  });

  it('maps a contact Regarding lookup so the UI can derive its account', async () => {
    mocks.retrieveRecordAsync.mockResolvedValueOnce({
      success: true,
      data: {
        activityid: 'activity-contact-1',
        subject: 'Contact follow-up',
        scheduledstart: '2026-07-14',
        statecode: 0,
        _regardingobjectid_value: 'contact-1',
        regardingobjectidtypecode: 'contact',
        regardingobjectidname: 'Dr. Taylor',
      },
    });
    mocks.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [] });

    await expect(ActivityService.get('activity-contact-1')).resolves.toEqual(
      expect.objectContaining({
        contact: { id: 'contact-1', fullname: 'Dr. Taylor' },
      }),
    );
  });
});