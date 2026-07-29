import { describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_TASK_FIELD_MAP,
  backgroundTaskFromDv,
  createBackgroundTaskService,
  type BackgroundTaskGateway,
} from '../background-task';

function gatewayStub(overrides: Partial<BackgroundTaskGateway> = {}): BackgroundTaskGateway {
  return {
    create: vi.fn(async () => ({ success: true, data: undefined })),
    update: vi.fn(async () => ({ success: true })),
    delete: vi.fn(async () => ({ success: true })),
    get: vi.fn(async () => ({ success: true, data: {} })),
    getAll: vi.fn(async () => ({ success: true, data: [] as unknown[] })),
    ...overrides,
  };
}

describe('backgroundTaskFromDv', () => {
  it('reads an opaque Dataverse row without depending on a generated type', () => {
    const task = backgroundTaskFromDv({
      crf5c_backgroundtaskid: 'id-1',
      crf5c_name: 'Mindray · intel',
      crf5c_tasktype: 'enrichment',
      crf5c_status: 'succeeded',
      crf5c_targetentitytype: 'account',
      crf5c_targetentityid: 'acc-1',
      _ownerid_value: 'user-1',
    });

    expect(task).toMatchObject({
      id: 'id-1',
      name: 'Mindray · intel',
      taskType: 'enrichment',
      status: 'succeeded',
      targetEntityType: 'account',
      ownerid: 'user-1',
    });
  });

  it('defaults a missing status to queued', () => {
    expect(backgroundTaskFromDv({}).status).toBe('queued');
  });
});

describe('createBackgroundTaskService', () => {
  it('recovers the id by read-back when create returns no body (mobile 204)', async () => {
    const getAll = vi.fn(async () => ({
      success: true,
      data: [{ crf5c_backgroundtaskid: 'created-1', crf5c_tasktype: 'enrichment', crf5c_status: 'queued' }],
    }));
    const service = createBackgroundTaskService(gatewayStub({ getAll }));

    const created = await service.create({
      name: 'task',
      taskType: 'enrichment',
      status: 'queued',
      targetEntityId: 'acc-1',
    });

    expect(created.id).toBe('created-1');
    // Read-back must scope to the same task type + target, newest first.
    expect(getAll).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: "crf5c_tasktype eq 'enrichment' and crf5c_targetentityid eq 'acc-1'",
        orderBy: ['createdon desc'],
        top: 1,
      }),
    );
  });

  it('still resolves when the id cannot be recovered, so the caller is never blocked', async () => {
    const service = createBackgroundTaskService(gatewayStub());
    const created = await service.create({ name: 'task', taskType: 'enrichment', status: 'queued' });
    expect(created.id).toBe('');
    expect(created.taskType).toBe('enrichment');
  });

  it('writes only the provided fields on update', async () => {
    const update = vi.fn(async () => ({ success: true }));
    const service = createBackgroundTaskService(gatewayStub({ update }));

    await service.update('id-1', { seenOn: '2026-07-29T00:00:00Z' });

    expect(update).toHaveBeenCalledWith('id-1', { crf5c_seenon: '2026-07-29T00:00:00Z' });
  });

  it('rejects an empty id instead of forwarding it to Dataverse', async () => {
    const update = vi.fn(async () => ({ success: true }));
    const service = createBackgroundTaskService(gatewayStub({ update }));

    await expect(service.update('', { status: 'failed' })).rejects.toThrow(/empty id/);
    expect(update).not.toHaveBeenCalled();
  });

  it('translates friendly field names in query options to Dataverse columns', async () => {
    const getAll = vi.fn(async () => ({ success: true, data: [] as unknown[] }));
    const service = createBackgroundTaskService(gatewayStub({ getAll }));

    await service.getAll({ filter: "status eq 'queued'", orderBy: ['createdon desc'] });

    expect(getAll).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "crf5c_status eq 'queued'" }),
    );
    expect(BACKGROUND_TASK_FIELD_MAP.status).toBe('crf5c_status');
  });

  it('surfaces a real error when a read fails without one', async () => {
    const service = createBackgroundTaskService(
      gatewayStub({ getAll: vi.fn(async () => ({ success: false, data: undefined })) }),
    );
    await expect(service.getAll()).rejects.toBeInstanceOf(Error);
  });
});
