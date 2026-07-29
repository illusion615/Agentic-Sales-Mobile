import type { BackgroundTask, BackgroundTaskStatus } from './model';

/**
 * Column mapping for `crf5c_backgroundtask`. Rows are read as opaque `unknown`
 * so this package never depends on any app's CLI-generated row interface.
 */

/** Friendly field name → Dataverse column, for translating filter/orderBy. */
export const BACKGROUND_TASK_FIELD_MAP: Record<string, string> = {
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

function str(row: Record<string, unknown>, col: string): string | undefined {
  const v = row[col];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Map a raw Dataverse row to the friendly model. */
export function backgroundTaskFromDv(raw: unknown): BackgroundTask {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(row, 'crf5c_backgroundtaskid') ?? '',
    name: str(row, 'crf5c_name') ?? '',
    taskType: str(row, 'crf5c_tasktype') ?? '',
    status: (str(row, 'crf5c_status') ?? 'queued') as BackgroundTaskStatus,
    targetEntityType: str(row, 'crf5c_targetentitytype'),
    targetEntityId: str(row, 'crf5c_targetentityid'),
    targetName: str(row, 'crf5c_targetname'),
    requestPayload: str(row, 'crf5c_requestpayload'),
    resultRef: str(row, 'crf5c_resultref'),
    resultSummary: str(row, 'crf5c_resultsummary'),
    error: str(row, 'crf5c_error'),
    startedOn: str(row, 'crf5c_startedon'),
    finishedOn: str(row, 'crf5c_finishedon'),
    seenOn: str(row, 'crf5c_seenon'),
    ownerid: str(row, '_ownerid_value') ?? '',
    createdon: str(row, 'createdon'),
  };
}

/** Map friendly fields to a Dataverse write payload (only provided keys). */
export function backgroundTaskToDv(r: Partial<Omit<BackgroundTask, 'id'>>): Record<string, unknown> {
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
