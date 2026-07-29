import { createBackgroundTaskService, type BackgroundTaskGateway, type BackgroundTaskService } from './service';
import type { BackgroundTask, BackgroundTaskType } from './model';

export interface EnqueueTaskInput {
  /** Routes the server-side Runner (e.g. 'enrichment'). */
  taskType: BackgroundTaskType;
  /** Short human label — the notification title (e.g. "迈瑞 · 市场情报"). */
  name: string;
  /** Record this task acts on — drives the completion deep-link. */
  targetEntityType?: string;
  targetEntityId?: string;
  targetName?: string;
  /** Structured input for the Runner (serialized to JSON). */
  payload?: Record<string, unknown>;
}

/** Where a finished task's result lives in the host app, if anywhere. */
export type TaskDeepLinkResolver = (
  task: Pick<BackgroundTask, 'targetEntityType' | 'targetEntityId'>,
) => string | null;

export interface BackgroundTaskClientOptions {
  gateway: BackgroundTaskGateway;
  /**
   * Maps a task's target record to an in-app route. Routing is app-specific
   * (entity types and URL shapes differ per app), so it is injected rather
   * than assumed. Omit it for apps with no deep-link surface.
   */
  resolveDeepLink?: TaskDeepLinkResolver;
}

export interface BackgroundTaskClient {
  service: BackgroundTaskService;
  /**
   * Enqueue a background task. Resolves once the row is created
   * (fire-and-forget); the caller does NOT wait for execution. The id may be
   * blank on the mobile player until the watcher reconciles — callers should
   * not depend on it.
   */
  enqueue(input: EnqueueTaskInput): Promise<BackgroundTask>;
  /** The in-app route to a task's result, or null when not routable. */
  deepLink(task: Pick<BackgroundTask, 'targetEntityType' | 'targetEntityId'>): string | null;
}

/**
 * Client entry point for the fire-and-forget background-task subsystem.
 * `enqueue` creates a queued task row and returns immediately; a server-side
 * Runner executes it and flips its status; a watcher surfaces completions.
 */
export function createBackgroundTaskClient(options: BackgroundTaskClientOptions): BackgroundTaskClient {
  const service = createBackgroundTaskService(options.gateway);

  return {
    service,

    enqueue(input) {
      return service.create({
        name: input.name,
        taskType: input.taskType,
        status: 'queued',
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId,
        targetName: input.targetName,
        requestPayload: input.payload ? JSON.stringify(input.payload) : undefined,
      });
    },

    deepLink(task) {
      if (!options.resolveDeepLink || !task.targetEntityType || !task.targetEntityId) return null;
      try {
        return options.resolveDeepLink(task);
      } catch {
        return null;
      }
    },
  };
}
