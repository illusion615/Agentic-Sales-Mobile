import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SignalService } from "../services/signal-service";
import type { Signal } from "../models/signal-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Signal records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, signaltype, description, detectedon, isactive, ownerid, relateddatajson, severityKey, title
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useSignalList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["signal-list", options],
    queryFn: () => SignalService.getAll(options),
  });
}

/**
 * Retrieve a single Signal record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useSignal(id: string) {
  return useQuery({
    queryKey: ["signal", id],
    queryFn: () => SignalService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Signal record.
 */
export function useCreateSignal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Signal, "id">) => SignalService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["signal-list"] });
    },
  });
}

/**
 * Update an existing Signal record.
 */
export function useUpdateSignal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Signal, "id">>;
    }) => SignalService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["signal-list"] });
      client.invalidateQueries({ queryKey: ["signal", variables.id] });
    },
  });
}

/**
 * Delete a Signal record by its unique identifier.
 */
export function useDeleteSignal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => SignalService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["signal-list"] });
      client.invalidateQueries({ queryKey: ["signal", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Signal_DATA_SOURCE_TYPE = 'Dataverse' as const;