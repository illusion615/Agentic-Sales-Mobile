/**
 * Background-task query hooks, bound to this app's task client.
 *
 * The hook bodies live in `@agentic/power-runtime/react`; binding them here
 * keeps the import path the pages already use.
 */
import { createBackgroundTaskHooks } from '@agentic/power-runtime/react';
import { backgroundTaskClient } from '@/lib/background-tasks';

const hooks = createBackgroundTaskHooks(backgroundTaskClient);

export const useBackgroundTaskList = hooks.useBackgroundTaskList;
export const useBackgroundTask = hooks.useBackgroundTask;
export const useWatchedBackgroundTasks = hooks.useWatchedBackgroundTasks;
export const useCreateBackgroundTask = hooks.useCreateBackgroundTask;
export const useUpdateBackgroundTask = hooks.useUpdateBackgroundTask;
