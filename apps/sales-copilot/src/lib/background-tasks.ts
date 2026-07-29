/**
 * Composition root for the fire-and-forget background-task subsystem.
 *
 * The lifecycle, table mapping and read-back behaviour live in
 * `@agentic/power-runtime`; this module supplies the two things that are
 * specific to this app — the Dataverse data source and the route map — and
 * re-exports the resulting API under the paths the app already uses.
 *
 * See docs/05-engineering/background-task-architecture-2026-07-20.md.
 */
import { createBackgroundTaskClient, type BackgroundTaskGateway } from '@agentic/power-runtime';
import { Crf5c_backgroundtasksService } from '@/generated/services/Crf5c_backgroundtasksService';
import { recordDetailRoute, type RecordEntityType } from '@/lib/record-route';

const ROUTABLE_TYPES: readonly RecordEntityType[] = ['account', 'opportunity', 'activity', 'contact'];

// Casts mirror the generated signatures, which demand a fully typed row.
const gateway: BackgroundTaskGateway = {
  create: (row) => Crf5c_backgroundtasksService.create(row as never),
  update: (id, row) => Crf5c_backgroundtasksService.update(id, row as never),
  delete: (id) => Crf5c_backgroundtasksService.delete(id),
  get: (id) => Crf5c_backgroundtasksService.get(id),
  getAll: (options) => Crf5c_backgroundtasksService.getAll(options),
};

export const backgroundTaskClient = createBackgroundTaskClient({
  gateway,
  resolveDeepLink: (task) => {
    const type = task.targetEntityType as RecordEntityType | undefined;
    if (!type || !task.targetEntityId || !ROUTABLE_TYPES.includes(type)) return null;
    return recordDetailRoute(type, task.targetEntityId);
  },
});

export const BackgroundTaskService = backgroundTaskClient.service;

/**
 * Enqueue a background task. Resolves once the row is created; the caller does
 * NOT wait for execution.
 */
export const enqueueTask = backgroundTaskClient.enqueue;

/** The in-app route to a completed task's result, or null when not routable. */
export const taskDeepLink = backgroundTaskClient.deepLink;

export {
  TERMINAL_TASK_STATUSES,
  ACTIVE_TASK_STATUSES,
  isTerminalTask,
  isActiveTask,
} from '@agentic/power-runtime';

export type {
  BackgroundTask,
  BackgroundTaskDraft,
  BackgroundTaskStatus,
  BackgroundTaskType,
  EnqueueTaskInput,
} from '@agentic/power-runtime';
