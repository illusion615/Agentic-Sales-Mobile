/**
 * Friendly domain model for the generic background-task subsystem
 * (crf5c_backgroundtask). Backs the long-running "fire-and-forget" tasks —
 * see docs/05-engineering/background-task-architecture-2026-07-20.md.
 */

/** Lifecycle of a background task. */
export type BackgroundTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** Known task types. Open-ended by design: a new long task is just a new value,
 *  no schema change. `enrichment` is the first consumer (account intelligence). */
export type BackgroundTaskType = 'enrichment' | (string & {});

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
  /** Pointer to the produced record (e.g. the AISummary id). */
  resultRef?: string;
  /** Short preview of the result, shown on the bell card. */
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

/** Terminal states — a task in one of these is done executing. */
export const TERMINAL_TASK_STATUSES: readonly BackgroundTaskStatus[] = ['succeeded', 'failed'];

/** In-flight states — the watcher polls tasks in one of these. */
export const ACTIVE_TASK_STATUSES: readonly BackgroundTaskStatus[] = ['queued', 'running'];
