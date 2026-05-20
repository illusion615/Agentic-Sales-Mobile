import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgentLogService } from "../services/agent-log-service";
import type { AgentLog } from "../models/agent-log-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all AgentLog records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, logName, agentName, queryText, responseText, sessionID, sourceDescription, timestamp
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useAgentLogList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["agentLog-list", options],
    queryFn: () => AgentLogService.getAll(options),
  });
}

/**
 * Retrieve a single AgentLog record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useAgentLog(id: string) {
  return useQuery({
    queryKey: ["agentLog", id],
    queryFn: () => AgentLogService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new AgentLog record.
 * @remarks Form validation: use CreateAgentLogSchema with zodResolver for type-safe create forms
 */
export function useCreateAgentLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AgentLog, "id">) => AgentLogService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["agentLog-list"] });
    },
  });
}

/**
 * Update an existing AgentLog record.
 * @remarks Form validation: use UpdateAgentLogSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateAgentLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<AgentLog, "id">>;
    }) => AgentLogService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["agentLog-list"] });
      client.invalidateQueries({ queryKey: ["agentLog", variables.id] });
    },
  });
}

/**
 * Delete a AgentLog record by its unique identifier.
 */
export function useDeleteAgentLog() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AgentLogService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["agentLog-list"] });
      client.invalidateQueries({ queryKey: ["agentLog", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const AgentLog_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { AgentLogSchema, CreateAgentLogSchema, UpdateAgentLogSchema } from "../validators/agent-log-validator";
export type { AgentLogInput, CreateAgentLogInput, UpdateAgentLogInput } from "../validators/agent-log-validator";