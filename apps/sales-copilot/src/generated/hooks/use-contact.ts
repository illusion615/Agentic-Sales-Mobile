import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ContactService } from "../services/contact-service";
import type { Contact } from "../models/contact-model";
import type { IOperationOptions } from '@microsoft/power-apps/data';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Contact records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, fullname, email, phone, title
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useContactList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["contact-list", options],
    queryFn: () => ContactService.getAll(options),
  });
}

/**
 * Retrieve a single Contact record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useContact(id: string) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => ContactService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Contact record.
 * @remarks Form validation: use CreateContactSchema with zodResolver for type-safe create forms
 */
export function useCreateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Contact, "id">) => ContactService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["contact-list"] });
    },
  });
}

/**
 * Update an existing Contact record.
 * @remarks Form validation: use UpdateContactSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Contact, "id">>;
    }) => ContactService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["contact-list"] });
      client.invalidateQueries({ queryKey: ["contact", variables.id] });
    },
  });
}

/**
 * Delete a Contact record by its unique identifier.
 */
export function useDeleteContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ContactService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["contact-list"] });
      client.invalidateQueries({ queryKey: ["contact", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Contact_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { ContactSchema, CreateContactSchema, UpdateContactSchema } from "../validators/contact-validator";
export type { ContactInput, CreateContactInput, UpdateContactInput } from "../validators/contact-validator";