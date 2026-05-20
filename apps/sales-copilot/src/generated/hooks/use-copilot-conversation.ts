import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CopilotConversationService } from "../services/copilot-conversation-service";
import type { CopilotConversation } from "../models/copilot-conversation-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all CopilotConversation records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, ownerid, lastactiveon, messagesjson, startedon
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useCopilotConversationList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["copilotConversation-list", options],
    queryFn: () => CopilotConversationService.getAll(options),
  });
}

/**
 * Retrieve a single CopilotConversation record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useCopilotConversation(id: string) {
  return useQuery({
    queryKey: ["copilotConversation", id],
    queryFn: () => CopilotConversationService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new CopilotConversation record.
 * @remarks Form validation: use CreateCopilotConversationSchema with zodResolver for type-safe create forms
 */
export function useCreateCopilotConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CopilotConversation, "id">) => CopilotConversationService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["copilotConversation-list"] });
    },
  });
}

/**
 * Update an existing CopilotConversation record.
 * @remarks Form validation: use UpdateCopilotConversationSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateCopilotConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<CopilotConversation, "id">>;
    }) => CopilotConversationService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["copilotConversation-list"] });
      client.invalidateQueries({ queryKey: ["copilotConversation", variables.id] });
    },
  });
}

/**
 * Delete a CopilotConversation record by its unique identifier.
 */
export function useDeleteCopilotConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CopilotConversationService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["copilotConversation-list"] });
      client.invalidateQueries({ queryKey: ["copilotConversation", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const CopilotConversation_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { CopilotConversationSchema, CreateCopilotConversationSchema, UpdateCopilotConversationSchema } from "../validators/copilot-conversation-validator";
export type { CopilotConversationInput, CreateCopilotConversationInput, UpdateCopilotConversationInput } from "../validators/copilot-conversation-validator";