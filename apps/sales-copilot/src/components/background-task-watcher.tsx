import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast-utils';
import { getLocale, t } from '@/lib/i18n';
import { useWatchedBackgroundTasks } from '@/generated/hooks/use-background-task';
import { TERMINAL_TASK_STATUSES } from '@/generated/models/background-task-model';
import { taskDeepLink } from '@/lib/background-tasks';

const TERMINAL = new Set<string>(TERMINAL_TASK_STATUSES);

/**
 * Global watcher for the fire-and-forget task subsystem. Polls the current
 * user's in-flight + unseen-finished tasks and, when one first appears in a
 * terminal state, raises a toast (with a deep-link to the produced record).
 *
 * Mounted ONCE above the router (in the layout) so completions surface no
 * matter which page the user is on — and, because the poll reconciles against
 * Dataverse, so do tasks that finished while the app was closed (a catch-up
 * toast fires on the next open). Marking a task as "seen" (via the bell) clears
 * it from the poll, so it never re-toasts.
 */
export function useBackgroundTaskWatcher() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useWatchedBackgroundTasks();
  // Task ids already toasted this session — avoids re-toasting on every poll.
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const locale = getLocale();
    for (const task of tasks) {
      if (!task.id || !TERMINAL.has(task.status) || task.seenOn) continue;
      if (notifiedRef.current.has(task.id)) continue;
      notifiedRef.current.add(task.id);

      const name = task.targetName || task.name || '';
      if (task.status === 'succeeded') {
        // The task wrote results to Dataverse server-side — refresh the views
        // that may now be stale so the new data appears without a manual reload.
        queryClient.invalidateQueries({ queryKey: ['account'] });
        queryClient.invalidateQueries({ queryKey: ['aISummary-list'] });
        const route = taskDeepLink(task);
        toast.success(
          t('taskCompletedToast', locale, { name }),
          route
            ? { action: { label: t('viewDetails', locale), onClick: () => navigate(route) } }
            : undefined,
        );
      } else {
        toast.error(t('taskFailedToast', locale, { name }));
      }
    }
  }, [tasks, navigate, queryClient]);
}
