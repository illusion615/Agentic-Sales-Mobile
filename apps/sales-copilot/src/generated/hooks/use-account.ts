import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AccountService } from "../services/account-service";
import type { Account } from "../models/account-model";
import type { IOperationOptions } from '../../../app-gen-sdk/data/common/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Account records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, name1, address, creditstatusKey, email, industry, lastcontactedon, lastinteractiondate, latitude, longitude, notes, ownerid, paymentstatusKey, phone, regionKey, tierKey
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useAccountList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["account-list", options],
    queryFn: () => AccountService.getAll(options),
  });
}

/**
 * Retrieve a single Account record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useAccount(id: string) {
  return useQuery({
    queryKey: ["account", id],
    queryFn: () => AccountService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Account record.
 * @remarks Form validation: use CreateAccountSchema with zodResolver for type-safe create forms
 */
export function useCreateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Account, "id">) => AccountService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["account-list"] });
    },
  });
}

/**
 * Update an existing Account record.
 * @remarks Form validation: use UpdateAccountSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Account, "id">>;
    }) => AccountService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["account-list"] });
      client.invalidateQueries({ queryKey: ["account", variables.id] });
    },
  });
}

/**
 * Delete a Account record by its unique identifier.
 */
export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AccountService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["account-list"] });
      client.invalidateQueries({ queryKey: ["account", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Account_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { AccountSchema, CreateAccountSchema, UpdateAccountSchema } from "../validators/account-validator";
export type { AccountInput, CreateAccountInput, UpdateAccountInput } from "../validators/account-validator";