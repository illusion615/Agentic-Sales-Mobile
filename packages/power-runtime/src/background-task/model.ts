/**
 * Friendly domain model for the generic background-task subsystem
 * (`crf5c_backgroundtask`), which backs long-running "fire-and-forget" work:
 * the client creates a queued row and returns immediately, a server-side Runner
 * executes it and flips the status, and the client observes completion.
 *
 * The table is a shared platform asset, so this model — and the column mapping
 * beside it — live here rather than in any single app.
 */

/** Lifecycle of a background task. */
export type BackgroundTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/**
 * Task type. Open-ended by design: a new kind of long-running work is just a
 * new value plus a Runner branch — never a schema change.
 */
export type BackgroundTaskType = string & {};

export interface BackgroundTask {
  /** GUID — never render as an input. */
  id: string;
  /** Primary name — a short human label, e.g. "迈瑞 · 市场情报". */
  name: string;
  /** What kind of work this is (routes the server-side Runner). */
  taskType: BackgroundTaskType;
  /** Lifecycle status. */
  status: BackgroundTaskStatus;
  /** The record this task acts on (for the completion deep-link). */
  targetEntityType?: string;
  targetEntityId?: string;
  targetName?: string;
  /** Task input, as a JSON string. */
  requestPayload?: string;
  /** Pointer to the produced record (e.g. the generated summary id). */
  resultRef?: string;
  /** Short preview of the result, shown on the notification card. */
  resultSummary?: string;
  /** Failure detail (drives the "retry" affordance). */
  error?: string;
  startedOn?: string;
  finishedOn?: string;
  /** When the requester saw the completion notification (drives read state). */
  seenOn?: string;
  /** Owner (Dataverse systemuserid). */
  ownerid: string;
  createdon?: string;
}

/** Fields the caller supplies when enqueuing; the rest are server-assigned. */
export type BackgroundTaskDraft = Omit<BackgroundTask, 'id' | 'ownerid' | 'createdon'>;

/** Terminal states — a task in one of these is done executing. */
export const TERMINAL_TASK_STATUSES: readonly BackgroundTaskStatus[] = ['succeeded', 'failed'];

/** In-flight states — the watcher polls tasks in one of these. */
export const ACTIVE_TASK_STATUSES: readonly BackgroundTaskStatus[] = ['queued', 'running'];

/** True when the task has finished executing (successfully or not). */
export function isTerminalTask(task: Pick<BackgroundTask, 'status'>): boolean {
  return TERMINAL_TASK_STATUSES.includes(task.status);
}

/** True when the task is still queued or running. */
export function isActiveTask(task: Pick<BackgroundTask, 'status'>): boolean {
  return ACTIVE_TASK_STATUSES.includes(task.status);
}
