import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TaskService } from "../services/task-service";
import type { Task } from "../models/task-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Task records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, title, createdon, duedate, isoverdue, notes, overduereason, ownerid, priorityKey, statusKey
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useTaskList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["task-list", options],
    queryFn: () => TaskService.getAll(options),
  });
}

/**
 * Retrieve a single Task record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useTask(id: string) {
  return useQuery({
    queryKey: ["task", id],
    queryFn: () => TaskService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Task record.
 */
export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Task, "id">) => TaskService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["task-list"] });
    },
  });
}

/**
 * Update an existing Task record.
 */
export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Task, "id">>;
    }) => TaskService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["task-list"] });
      client.invalidateQueries({ queryKey: ["task", variables.id] });
    },
  });
}

/**
 * Delete a Task record by its unique identifier.
 */
export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => TaskService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["task-list"] });
      client.invalidateQueries({ queryKey: ["task", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Task_DATA_SOURCE_TYPE = 'Dataverse' as const;