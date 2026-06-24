import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AISummaryService } from "../services/ai-summary-service";
import type { AISummary } from "../models/ai-summary-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all AISummary records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, entityID, actionItems, entityTypeKey, expiresOn, generatedOn, statusKey, summary
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useAISummaryList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["aISummary-list", options],
    queryFn: () => AISummaryService.getAll(options),
  });
}

/**
 * Retrieve a single AISummary record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useAISummary(id: string) {
  return useQuery({
    queryKey: ["aISummary", id],
    queryFn: () => AISummaryService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new AISummary record.
 * @remarks Form validation: use CreateAISummarySchema with zodResolver for type-safe create forms
 */
export function useCreateAISummary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AISummary, "id">) => AISummaryService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["aISummary-list"] });
    },
  });
}

/**
 * Update an existing AISummary record.
 * @remarks Form validation: use UpdateAISummarySchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateAISummary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<AISummary, "id">>;
    }) => AISummaryService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["aISummary-list"] });
      client.invalidateQueries({ queryKey: ["aISummary", variables.id] });
    },
  });
}

/**
 * Delete a AISummary record by its unique identifier.
 */
export function useDeleteAISummary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AISummaryService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["aISummary-list"] });
      client.invalidateQueries({ queryKey: ["aISummary", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const AISummary_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { AISummarySchema, CreateAISummarySchema, UpdateAISummarySchema } from "../validators/aisummary-validator";
export type { AISummaryInput, CreateAISummaryInput, UpdateAISummaryInput } from "../validators/aisummary-validator";