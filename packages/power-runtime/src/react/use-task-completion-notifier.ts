import { useEffect, useRef } from 'react';
import { isTerminalTask, type BackgroundTask } from '../background-task/model';

export interface TaskCompletionHandlers {
  onSucceeded(task: BackgroundTask): void;
  onFailed(task: BackgroundTask): void;
}

/**
 * Fire a completion handler exactly once per task, the first time it is
 * observed in a terminal, unseen state.
 *
 * This is the whole generic half of a task watcher: because the poll reconciles
 * against Dataverse, it also covers tasks that finished while the app was
 * closed (they surface on the next open). Marking a task as seen removes it
 * from the polled set, so it never re-fires.
 *
 * What to DO on completion — toast wording, deep-link navigation, which caches
 * to invalidate — is app-specific and stays with the caller. Handlers are read
 * through a ref, so callers need not memoize them.
 */
export function useTaskCompletionNotifier(
  tasks: readonly BackgroundTask[],
  handlers: TaskCompletionHandlers,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const task of tasks) {
      if (!task.id || !isTerminalTask(task) || task.seenOn) continue;
      if (notifiedRef.current.has(task.id)) continue;
      notifiedRef.current.add(task.id);

      if (task.status === 'succeeded') handlersRef.current.onSucceeded(task);
      else handlersRef.current.onFailed(task);
    }
  }, [tasks]);
}
