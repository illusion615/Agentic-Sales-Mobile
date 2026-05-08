import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OpportunityService } from "../services/opportunity-service";
import type { Opportunity } from "../models/opportunity-model";
import type { IOperationOptions } from '../../../app-gen-sdk/data/common/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Opportunity records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, name1, blocker, closedon, confidence, confidencetrendKey, createdon, expectedclosedate, lastaction, ownerid, stageKey, totalamount
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useOpportunityList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["opportunity-list", options],
    queryFn: () => OpportunityService.getAll(options),
  });
}

/**
 * Retrieve a single Opportunity record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: () => OpportunityService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Opportunity record.
 */
export function useCreateOpportunity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Opportunity, "id">) => OpportunityService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["opportunity-list"] });
    },
  });
}

/**
 * Update an existing Opportunity record.
 */
export function useUpdateOpportunity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Opportunity, "id">>;
    }) => OpportunityService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["opportunity-list"] });
      client.invalidateQueries({ queryKey: ["opportunity", variables.id] });
    },
  });
}

/**
 * Delete a Opportunity record by its unique identifier.
 */
export function useDeleteOpportunity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => OpportunityService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["opportunity-list"] });
      client.invalidateQueries({ queryKey: ["opportunity", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Opportunity_DATA_SOURCE_TYPE = 'Dataverse' as const;