import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityService } from "../services/activity-service";
import type { Activity } from "../models/activity-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Activity records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, title, createdon, draftstatusKey, notes, outcomeKey, ownerid, scheduleddate, typeKey
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useActivityList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["activity-list", options],
    queryFn: () => ActivityService.getAll(options),
    staleTime: 60_000,
  });
}

/**
 * Retrieve a single Activity record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useActivity(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["activity", id],
    queryFn: () => ActivityService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
    retry: false,
    throwOnError: false,
    placeholderData: () => {
      const list = client.getQueryData<Activity[]>(["activity-list"]);
      return list?.find((a) => a.id === id);
    },
    staleTime: 30_000,
  });
}

/**
 * Create a new Activity record.
 * @remarks Form validation: use CreateActivitySchema with zodResolver for type-safe create forms
 */
export function useCreateActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Activity, "id">) => ActivityService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["activity-list"] });
    },
  });
}

/**
 * Update an existing Activity record.
 * @remarks Form validation: use UpdateActivitySchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Activity, "id">>;
    }) => ActivityService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["activity-list"] });
      client.invalidateQueries({ queryKey: ["activity", variables.id] });
    },
  });
}

/**
 * Delete a Activity record by its unique identifier.
 */
export function useDeleteActivity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ActivityService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["activity-list"] });
      client.invalidateQueries({ queryKey: ["activity", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Activity_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { ActivitySchema, CreateActivitySchema, UpdateActivitySchema } from "../validators/activity-validator";
export type { ActivityInput, CreateActivityInput, UpdateActivityInput } from "../validators/activity-validator";