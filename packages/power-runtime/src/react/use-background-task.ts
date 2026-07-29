import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DataverseListOptions } from '../dataverse/types';
import { WATCHED_TASKS_FILTER } from '../background-task/service';
import type { BackgroundTaskClient } from '../background-task/client';
import type { BackgroundTask, BackgroundTaskDraft } from '../background-task/model';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_KEY = 'backgroundTask-list';
const WATCH_KEY = 'backgroundTask-watch';
const ITEM_KEY = 'backgroundTask';

/**
 * Bind the background-task query/mutation hooks to one client. Called once per
 * app (the client carries that app's data-source binding), so the hooks stay
 * plain hooks at the call site with no provider plumbing.
 */
export function createBackgroundTaskHooks(client: BackgroundTaskClient) {
  const { service } = client;

  return {
    /** List background tasks (optionally filtered/sorted). */
    useBackgroundTaskList(options?: DataverseListOptions) {
      return useQuery({
        queryKey: [LIST_KEY, options],
        queryFn: () => service.getAll(options),
      });
    },

    /** Single background task by id. */
    useBackgroundTask(id: string) {
      return useQuery({
        queryKey: [ITEM_KEY, id],
        queryFn: () => service.get(id),
        enabled: !!id && UUID_REGEX.test(id),
      });
    },

    /**
     * Poll the tasks a watcher cares about: everything not yet seen plus
     * anything still in flight. Refetches on an interval so completions surface
     * even while the user is on another page. `pollMs = 0` disables polling.
     *
     * Owner scoping is enforced server-side by Dataverse security — a user only
     * reads their own rows here.
     */
    useWatchedBackgroundTasks(pollMs = 8000) {
      return useQuery({
        queryKey: [WATCH_KEY],
        queryFn: () =>
          service.getAll({ filter: WATCHED_TASKS_FILTER, orderBy: ['createdon desc'], top: 50 }),
        refetchInterval: pollMs > 0 ? pollMs : false,
        refetchIntervalInBackground: true,
      });
    },

    /** Enqueue a new background task. */
    useCreateBackgroundTask() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: (data: BackgroundTaskDraft) => service.create(data),
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
          queryClient.invalidateQueries({ queryKey: [WATCH_KEY] });
        },
      });
    },

    /** Update a task (e.g. mark its completion notification as seen). */
    useUpdateBackgroundTask() {
      const queryClient = useQueryClient();
      return useMutation({
        mutationFn: ({ id, changedFields }: { id: string; changedFields: Partial<Omit<BackgroundTask, 'id'>> }) =>
          service.update(id, changedFields),
        onSuccess: (_data, variables) => {
          queryClient.invalidateQueries({ queryKey: [LIST_KEY] });
          queryClient.invalidateQueries({ queryKey: [WATCH_KEY] });
          queryClient.invalidateQueries({ queryKey: [ITEM_KEY, variables.id] });
        },
      });
    },
  };
}

export type BackgroundTaskHooks = ReturnType<typeof createBackgroundTaskHooks>;
