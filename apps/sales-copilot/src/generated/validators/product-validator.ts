import { z } from 'zod';

/**
 * Zod schema for Product validation
 */
export const ProductSchema = z.object({
  id: z.string().uuid(),
  productName: z.string().min(1, { message: "Product Name is required" }),
  category: z.string().min(1, { message: "Category is required" }),
  featureHighlight: z.string().min(1, { message: "Feature Highlight is required" }),
  imageURL: z.string().min(1, { message: "Image URL is required" }),
  productURL: z.string().min(1, { message: "Product URL is required" }),
  sortOrder: z.number().int(),
  specification: z.string().min(1, { message: "Specification is required" }),
  summary: z.string().min(1, { message: "Summary is required" }),
});

/**
 * Schema for creating a new Product (omits system-generated ID)
 */
export const CreateProductSchema = ProductSchema.omit({ id: true });

/**
 * Schema for updating an existing Product
 */
export const UpdateProductSchema = ProductSchema;

export type ProductInput = z.infer<typeof ProductSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;