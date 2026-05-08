import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BriefingService } from "../services/briefing-service";
import type { Briefing } from "../models/briefing-model";
import type { IOperationOptions } from '../../../app-gen-sdk/data/common/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Briefing records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, ownerid, audiourl, generatedon, lastposition, payloadjson
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useBriefingList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["briefing-list", options],
    queryFn: () => BriefingService.getAll(options),
  });
}

/**
 * Retrieve a single Briefing record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useBriefing(id: string) {
  return useQuery({
    queryKey: ["briefing", id],
    queryFn: () => BriefingService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Briefing record.
 */
export function useCreateBriefing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Briefing, "id">) => BriefingService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["briefing-list"] });
    },
  });
}

/**
 * Update an existing Briefing record.
 */
export function useUpdateBriefing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Briefing, "id">>;
    }) => BriefingService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["briefing-list"] });
      client.invalidateQueries({ queryKey: ["briefing", variables.id] });
    },
  });
}

/**
 * Delete a Briefing record by its unique identifier.
 */
export function useDeleteBriefing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BriefingService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["briefing-list"] });
      client.invalidateQueries({ queryKey: ["briefing", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Briefing_DATA_SOURCE_TYPE = 'Dataverse' as const;