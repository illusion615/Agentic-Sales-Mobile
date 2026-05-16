import { z } from 'zod';

/**
 * Zod schema for BusinessInsight validation
 */
export const BusinessInsightSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, { message: "Title is required" }),
  detailsjson: z.string().min(1, { message: "Details JSON is required" }),
  displayorder: z.number().int(),
  generatedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Generated On is required" }),
  isactive: z.boolean(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  rationale: z.string().min(1, { message: "Rationale is required" }),
  referenceidsjson: z.string().min(1, { message: "Reference IDs JSON is required" }),
  referencetypeKey: z.enum(['ReferencetypeKey0', 'ReferencetypeKey1']),
  summary: z.string().min(1, { message: "Summary is required" }),
  typeKey: z.enum(['TypeKey0', 'TypeKey1', 'TypeKey2']),
  validuntil: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Valid Until is required" }),
});

/**
 * Schema for creating a new BusinessInsight (omits system-generated ID)
 */
export const CreateBusinessInsightSchema = BusinessInsightSchema.omit({ id: true });

/**
 * Schema for updating an existing BusinessInsight
 */
export const UpdateBusinessInsightSchema = BusinessInsightSchema;

export type BusinessInsightInput = z.infer<typeof BusinessInsightSchema>;
export type CreateBusinessInsightInput = z.infer<typeof CreateBusinessInsightSchema>;
export type UpdateBusinessInsightInput = z.infer<typeof UpdateBusinessInsightSchema>;