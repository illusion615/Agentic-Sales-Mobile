import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SettingService } from "../services/setting-service";
import type { Setting } from "../models/setting-model";
import type { IOperationOptions } from '../../../app-gen-sdk/data/common/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Setting records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, settingKey, description, settingValue, updatedOn
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useSettingList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["setting-list", options],
    queryFn: () => SettingService.getAll(options),
  });
}

/**
 * Retrieve a single Setting record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useSetting(id: string) {
  return useQuery({
    queryKey: ["setting", id],
    queryFn: () => SettingService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Setting record.
 * @remarks Form validation: use CreateSettingSchema with zodResolver for type-safe create forms
 */
export function useCreateSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Setting, "id">) => SettingService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["setting-list"] });
    },
  });
}

/**
 * Update an existing Setting record.
 * @remarks Form validation: use UpdateSettingSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Setting, "id">>;
    }) => SettingService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["setting-list"] });
      client.invalidateQueries({ queryKey: ["setting", variables.id] });
    },
  });
}

/**
 * Delete a Setting record by its unique identifier.
 */
export function useDeleteSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => SettingService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["setting-list"] });
      client.invalidateQueries({ queryKey: ["setting", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Setting_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { SettingSchema, CreateSettingSchema, UpdateSettingSchema } from "../validators/setting-validator";
export type { SettingInput, CreateSettingInput, UpdateSettingInput } from "../validators/setting-validator";