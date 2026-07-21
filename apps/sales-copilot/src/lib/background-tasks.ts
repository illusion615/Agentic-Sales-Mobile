/**
 * Client entry point for the fire-and-forget background-task subsystem.
 * `enqueueTask` creates a queued task row (returns immediately); a server-side
 * Runner (Power Automate) executes it and flips its status. The global
 * BackgroundTaskWatcher surfaces completions as toasts + bell items.
 *
 * See docs/05-engineering/background-task-architecture-2026-07-20.md.
 */
import { BackgroundTaskService } from '@/generated/services/background-task-service';
import type { BackgroundTask, BackgroundTaskType } from '@/generated/models/background-task-model';
import { recordDetailRoute, type RecordEntityType } from '@/lib/record-route';

const ROUTABLE_TYPES: readonly RecordEntityType[] = ['account', 'opportunity', 'activity', 'contact'];

export interface EnqueueTaskInput {
  /** Routes the server-side Runner (e.g. 'enrichment'). */
  taskType: BackgroundTaskType;
  /** Short human label — the notification title (e.g. "迈瑞 · 市场情报"). */
  name: string;
  /** Record this task acts on — drives the completion deep-link. */
  targetEntityType?: RecordEntityType | string;
  targetEntityId?: string;
  targetName?: string;
  /** Structured input for the Runner (serialized to JSON). */
  payload?: Record<string, unknown>;
}

/**
 * Enqueue a background task. Resolves once the row is created (fire-and-forget);
 * the caller does NOT wait for execution. The id may be blank on the mobile
 * player until the watcher reconciles — callers should not depend on it.
 */
export async function enqueueTask(input: EnqueueTaskInput): Promise<BackgroundTask> {
  return BackgroundTaskService.create({
    name: input.name,
    taskType: input.taskType,
    status: 'queued',
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    targetName: input.targetName,
    requestPayload: input.payload ? JSON.stringify(input.payload) : undefined,
  });
}

/** The in-app route to a completed task's result, or null when not routable. */
export function taskDeepLink(task: Pick<BackgroundTask, 'targetEntityType' | 'targetEntityId'>): string | null {
  const type = task.targetEntityType as RecordEntityType | undefined;
  if (!type || !task.targetEntityId) return null;
  if (!ROUTABLE_TYPES.includes(type)) return null;
  try {
    return recordDetailRoute(type, task.targetEntityId);
  } catch {
    return null;
  }
}
