import { withRetry } from '../async/retry';
import { mapOptions, odataString, requireId, withReadTimeout } from '../dataverse/query';
import type { DataverseListOptions, DataverseResult } from '../dataverse/types';
import { BACKGROUND_TASK_FIELD_MAP, backgroundTaskFromDv, backgroundTaskToDv } from './mapping';
import type { BackgroundTask, BackgroundTaskDraft } from './model';

/**
 * Transport for the background-task table. Each app supplies its own
 * CLI-generated service here, which is what binds the shared subsystem to that
 * app's data sources. Rows are opaque (`unknown`) so a generated row interface
 * satisfies this without an adapter.
 */
export interface BackgroundTaskGateway {
  create(row: Record<string, unknown>): Promise<DataverseResult<unknown>>;
  update(id: string, row: Record<string, unknown>): Promise<DataverseResult<unknown>>;
  delete(id: string): Promise<DataverseResult<unknown>>;
  get(id: string): Promise<DataverseResult<unknown>>;
  getAll(options?: DataverseListOptions): Promise<DataverseResult<unknown[]>>;
}

export interface BackgroundTaskService {
  create(record: BackgroundTaskDraft): Promise<BackgroundTask>;
  update(id: string, changedFields: Partial<Omit<BackgroundTask, 'id'>>): Promise<void>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<BackgroundTask>;
  getAll(options?: DataverseListOptions): Promise<BackgroundTask[]>;
}

/** Build the friendly task service over an app-provided transport. */
export function createBackgroundTaskService(gateway: BackgroundTaskGateway): BackgroundTaskService {
  /**
   * The mobile native player returns success with no body (HTTP 204) on create,
   * so when the primary key isn't echoed we read the row back (newest task with
   * the same target + type) to recover the id.
   */
  async function readBackCreatedTask(record: BackgroundTaskDraft): Promise<BackgroundTask | null> {
    const clauses = [`crf5c_tasktype eq '${odataString(record.taskType)}'`];
    if (record.targetEntityId) clauses.push(`crf5c_targetentityid eq '${odataString(record.targetEntityId)}'`);
    try {
      const readback = await withRetry(
        () => gateway.getAll({ filter: clauses.join(' and '), orderBy: ['createdon desc'], top: 1 }),
        { attempts: 3, backoffMs: 300, jitterMs: 200 },
      );
      const rows = readback.success ? readback.data ?? [] : [];
      if (rows.length > 0) return backgroundTaskFromDv(rows[0]);
    } catch (e) {
      console.warn('[BackgroundTask] create read-back failed:', e);
    }
    return null;
  }

  return {
    async create(record) {
      const result = await gateway.create(backgroundTaskToDv(record));
      if (!result.success) throw result.error ?? new Error('Background task create failed');
      let created = result.data ? backgroundTaskFromDv(result.data) : null;

      if (!created?.id) {
        const readBack = await readBackCreatedTask(record);
        if (readBack) created = readBack;
      }
      // Even if the id could not be recovered, the write succeeded — return a
      // best-effort object so the caller is not blocked. The watcher reconciles
      // by owner + status regardless.
      return created ?? { id: '', ownerid: '', ...record };
    },

    async update(id, changedFields) {
      requireId(id, 'update', 'BackgroundTask');
      const result = await gateway.update(id, backgroundTaskToDv(changedFields));
      if (!result.success) throw result.error ?? new Error('Background task update failed');
    },

    async delete(id) {
      requireId(id, 'delete', 'BackgroundTask');
      await gateway.delete(id);
    },

    async get(id) {
      requireId(id, 'get', 'BackgroundTask');
      const result = await gateway.get(id);
      if (!result.success) throw result.error ?? new Error('Background task get failed');
      return backgroundTaskFromDv(result.data);
    },

    async getAll(options) {
      const result = await withReadTimeout(
        gateway.getAll(mapOptions(options, BACKGROUND_TASK_FIELD_MAP)),
        'BackgroundTask.getAll',
      );
      if (!result.success) throw result.error ?? new Error('Background task getAll failed');
      return (result.data ?? []).map(backgroundTaskFromDv);
    },
  };
}

/** OData filter selecting the tasks a watcher must observe. */
export const WATCHED_TASKS_FILTER =
  "crf5c_status eq 'queued' or crf5c_status eq 'running' or crf5c_seenon eq null";
