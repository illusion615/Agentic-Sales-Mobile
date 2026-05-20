import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BusinessInsightService } from "../services/business-insight-service";
import type { BusinessInsight } from "../models/business-insight-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all BusinessInsight records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, title, detailsjson, displayorder, generatedon, isactive, ownerid, rationale, referenceidsjson, referencetypeKey, summary, typeKey, validuntil
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useBusinessInsightList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["businessInsight-list", options],
    queryFn: () => BusinessInsightService.getAll(options),
  });
}

/**
 * Retrieve a single BusinessInsight record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useBusinessInsight(id: string) {
  return useQuery({
    queryKey: ["businessInsight", id],
    queryFn: () => BusinessInsightService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new BusinessInsight record.
 * @remarks Form validation: use CreateBusinessInsightSchema with zodResolver for type-safe create forms
 */
export function useCreateBusinessInsight() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<BusinessInsight, "id">) => BusinessInsightService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["businessInsight-list"] });
    },
  });
}

/**
 * Update an existing BusinessInsight record.
 * @remarks Form validation: use UpdateBusinessInsightSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateBusinessInsight() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<BusinessInsight, "id">>;
    }) => BusinessInsightService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["businessInsight-list"] });
      client.invalidateQueries({ queryKey: ["businessInsight", variables.id] });
    },
  });
}

/**
 * Delete a BusinessInsight record by its unique identifier.
 */
export function useDeleteBusinessInsight() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BusinessInsightService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["businessInsight-list"] });
      client.invalidateQueries({ queryKey: ["businessInsight", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const BusinessInsight_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { BusinessInsightSchema, CreateBusinessInsightSchema, UpdateBusinessInsightSchema } from "../validators/business-insight-validator";
export type { BusinessInsightInput, CreateBusinessInsightInput, UpdateBusinessInsightInput } from "../validators/business-insight-validator";