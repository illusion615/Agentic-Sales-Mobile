import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { IOperationOptions } from '@microsoft/power-apps/data';
import { BackgroundTaskService } from '../services/background-task-service';
import type { BackgroundTask } from '../models/background-task-model';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** List background tasks (optionally filtered/sorted). */
export function useBackgroundTaskList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ['backgroundTask-list', options],
    queryFn: () => BackgroundTaskService.getAll(options),
  });
}

/** Single background task by id. */
export function useBackgroundTask(id: string) {
  return useQuery({
    queryKey: ['backgroundTask', id],
    queryFn: () => BackgroundTaskService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Poll the tasks the watcher cares about: everything not yet seen plus anything
 * still in flight. Refetches on an interval so completions surface even while
 * the user is on another page. `pollMs = 0` disables polling.
 */
export function useWatchedBackgroundTasks(pollMs = 8000) {
  return useQuery({
    queryKey: ['backgroundTask-watch'],
    // In-flight OR finished-but-unseen. Owner scoping is enforced server-side by
    // Dataverse security (a user only reads their own rows here).
    queryFn: () =>
      BackgroundTaskService.getAll({
        filter: "crf5c_status eq 'queued' or crf5c_status eq 'running' or crf5c_seenon eq null",
        orderBy: ['createdon desc'],
        top: 50,
      }),
    refetchInterval: pollMs > 0 ? pollMs : false,
    refetchIntervalInBackground: true,
  });
}

/** Enqueue a new background task. */
export function useCreateBackgroundTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<BackgroundTask, 'id' | 'ownerid' | 'createdon'>) => BackgroundTaskService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['backgroundTask-list'] });
      client.invalidateQueries({ queryKey: ['backgroundTask-watch'] });
    },
  });
}

/** Update a background task (e.g. mark its completion notification as seen). */
export function useUpdateBackgroundTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changedFields }: { id: string; changedFields: Partial<Omit<BackgroundTask, 'id'>> }) =>
      BackgroundTaskService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ['backgroundTask-list'] });
      client.invalidateQueries({ queryKey: ['backgroundTask-watch'] });
      client.invalidateQueries({ queryKey: ['backgroundTask', variables.id] });
    },
  });
}
