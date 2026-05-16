import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProductService } from "../services/product-service";
import type { Product } from "../models/product-model";
import type { IOperationOptions } from '../../../app-gen-sdk/data/common/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieve all Product records with optional filtering and sorting.
 * @param options Optional filtering and sorting options
 *   Available properties for sorting: id, productName, category, featureHighlight, imageURL, productURL, sortOrder, specification, summary
 *   Filtering supports OData syntax, e.g., "status eq 'active'"
 */
export function useProductList(options?: IOperationOptions) {
  return useQuery({
    queryKey: ["product-list", options],
    queryFn: () => ProductService.getAll(options),
  });
}

/**
 * Retrieve a single Product record by its unique identifier.
 * @param id The id of the record (must be a valid UUID)
 */
export function useProduct(id: string) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => ProductService.get(id),
    enabled: !!id && UUID_REGEX.test(id),
  });
}

/**
 * Create a new Product record.
 * @remarks Form validation: use CreateProductSchema with zodResolver for type-safe create forms
 */
export function useCreateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Product, "id">) => ProductService.create(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["product-list"] });
    },
  });
}

/**
 * Update an existing Product record.
 * @remarks Form validation: use UpdateProductSchema.partial().omit({ id: true }) with zodResolver for edit forms (matches changedFields input)
 */
export function useUpdateProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      changedFields,
    }: {
      id: string;
      changedFields: Partial<Omit<Product, "id">>;
    }) => ProductService.update(id, changedFields),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["product-list"] });
      client.invalidateQueries({ queryKey: ["product", variables.id] });
    },
  });
}

/**
 * Delete a Product record by its unique identifier.
 */
export function useDeleteProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProductService.delete(id),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["product-list"] });
      client.invalidateQueries({ queryKey: ["product", id] });
    },
  });
}

/** Data source type for this table — drives InMemoryDataBanner visibility. */
export const Product_DATA_SOURCE_TYPE = 'Dataverse' as const;

export { ProductSchema, CreateProductSchema, UpdateProductSchema } from "../validators/product-validator";
export type { ProductInput, CreateProductInput, UpdateProductInput } from "../validators/product-validator";