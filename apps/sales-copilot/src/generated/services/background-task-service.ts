/**
 * Background-task adapter service — thin friendly wrapper over the generated
 * crf5c_backgroundtask CRUD. Part of the long-running "fire-and-forget"
 * subsystem (docs/05-engineering/background-task-architecture-2026-07-20.md).
 */
import { Crf5c_backgroundtasksService } from './Crf5c_backgroundtasksService';
import type { Crf5c_backgroundtasks } from '../models/Crf5c_backgroundtasksModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { BackgroundTask, BackgroundTaskStatus } from '../models/background-task-model';
import { mapOptions, withReadTimeout, requireId } from './_adapter-utils';
import { withRetry } from '@/lib/retry';

/** Friendly field name → Dataverse column, for translating filter/orderBy. */
const FIELD_MAP: Record<string, string> = {
  id: 'crf5c_backgroundtaskid',
  name: 'crf5c_name',
  taskType: 'crf5c_tasktype',
  status: 'crf5c_status',
  targetEntityType: 'crf5c_targetentitytype',
  targetEntityId: 'crf5c_targetentityid',
  targetName: 'crf5c_targetname',
  requestPayload: 'crf5c_requestpayload',
  resultRef: 'crf5c_resultref',
  resultSummary: 'crf5c_resultsummary',
  error: 'crf5c_error',
  startedOn: 'crf5c_startedon',
  finishedOn: 'crf5c_finishedon',
  seenOn: 'crf5c_seenon',
  ownerid: '_ownerid_value',
  createdon: 'createdon',
};

function fromDv(dv: Crf5c_backgroundtasks): BackgroundTask {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_backgroundtaskid,
    name: dv.crf5c_name ?? '',
    taskType: dv.crf5c_tasktype ?? '',
    status: (dv.crf5c_status ?? 'queued') as BackgroundTaskStatus,
    targetEntityType: dv.crf5c_targetentitytype,
    targetEntityId: dv.crf5c_targetentityid,
    targetName: dv.crf5c_targetname,
    requestPayload: dv.crf5c_requestpayload,
    resultRef: dv.crf5c_resultref,
    resultSummary: dv.crf5c_resultsummary,
    error: dv.crf5c_error,
    startedOn: dv.crf5c_startedon,
    finishedOn: dv.crf5c_finishedon,
    seenOn: dv.crf5c_seenon,
    ownerid: (d._ownerid_value as string) ?? '',
    createdon: dv.createdon,
  };
}

function toDv(r: Partial<Omit<BackgroundTask, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.name !== undefined) dv.crf5c_name = r.name;
  if (r.taskType !== undefined) dv.crf5c_tasktype = r.taskType;
  if (r.status !== undefined) dv.crf5c_status = r.status;
  if (r.targetEntityType !== undefined) dv.crf5c_targetentitytype = r.targetEntityType;
  if (r.targetEntityId !== undefined) dv.crf5c_targetentityid = r.targetEntityId;
  if (r.targetName !== undefined) dv.crf5c_targetname = r.targetName;
  if (r.requestPayload !== undefined) dv.crf5c_requestpayload = r.requestPayload;
  if (r.resultRef !== undefined) dv.crf5c_resultref = r.resultRef;
  if (r.resultSummary !== undefined) dv.crf5c_resultsummary = r.resultSummary;
  if (r.error !== undefined) dv.crf5c_error = r.error;
  if (r.startedOn !== undefined) dv.crf5c_startedon = r.startedOn;
  if (r.finishedOn !== undefined) dv.crf5c_finishedon = r.finishedOn;
  if (r.seenOn !== undefined) dv.crf5c_seenon = r.seenOn;
  return dv;
}

/** Escape a value for an OData string literal. */
const odataStr = (v: string) => v.replace(/'/g, "''");

export class BackgroundTaskService {
  /**
   * Create (enqueue) a task. Returns the created task with its real id.
   *
   * The mobile native player returns success with no body (HTTP 204) on create,
   * so when the primary key isn't echoed we read the row back (newest task with
   * the same target + type) to recover the id — mirroring the resilient create
   * pattern used across the generated services.
   */
  static async create(record: Omit<BackgroundTask, 'id' | 'ownerid' | 'createdon'>): Promise<BackgroundTask> {
    const result = await Crf5c_backgroundtasksService.create(toDv(record) as never);
    if (!result.success) throw result.error ?? new Error('Background task create failed');
    let created = result.data ? fromDv(result.data) : null;

    if (!created?.id) {
      const readBack = await readBackCreatedTask(record);
      if (readBack) created = readBack;
    }
    // Even if the id could not be recovered, the write succeeded — return a
    // best-effort object so the caller (which toasts + relies on the watcher)
    // is not blocked. The watcher reconciles by owner + status regardless.
    return created ?? { id: '', ownerid: '', ...record };
  }

  static async update(id: string, changedFields: Partial<Omit<BackgroundTask, 'id'>>): Promise<void> {
    requireId(id, 'update', 'BackgroundTask');
    const result = await Crf5c_backgroundtasksService.update(id, toDv(changedFields) as never);
    if (!result.success) throw result.error ?? new Error('Background task update failed');
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'BackgroundTask');
    await Crf5c_backgroundtasksService.delete(id);
  }

  static async get(id: string): Promise<BackgroundTask> {
    requireId(id, 'get', 'BackgroundTask');
    const result = await Crf5c_backgroundtasksService.get(id);
    if (!result.success) throw result.error ?? new Error('Background task get failed');
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<BackgroundTask[]> {
    const result = await withReadTimeout(
      Crf5c_backgroundtasksService.getAll(mapOptions(options, FIELD_MAP) as never),
      'BackgroundTask.getAll',
    );
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}

async function readBackCreatedTask(
  record: Omit<BackgroundTask, 'id' | 'ownerid' | 'createdon'>,
): Promise<BackgroundTask | null> {
  const clauses = [`crf5c_tasktype eq '${odataStr(record.taskType)}'`];
  if (record.targetEntityId) clauses.push(`crf5c_targetentityid eq '${odataStr(record.targetEntityId)}'`);
  try {
    const readback = await withRetry(
      () => Crf5c_backgroundtasksService.getAll({ filter: clauses.join(' and '), orderBy: ['createdon desc'], top: 1 }),
      { attempts: 3, backoffMs: 300, jitterMs: 200 },
    );
    if (readback.success && readback.data && readback.data.length > 0) {
      return fromDv(readback.data[0]);
    }
  } catch (e) {
    console.warn('[BackgroundTask] create read-back failed:', e);
  }
  return null;
}
