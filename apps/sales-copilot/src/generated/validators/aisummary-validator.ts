import { z } from 'zod';

/**
 * Zod schema for AISummary validation
 */
export const AISummarySchema = z.object({
  id: z.string().uuid(),
  entityID: z.string().min(1, { message: "Entity ID is required" }),
  actionItems: z.string().optional(),
  entityTypeKey: z.enum(['EntityTypeKey0', 'EntityTypeKey1', 'EntityTypeKey2', 'EntityTypeKey3']),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  statusKey: z.enum(['StatusKey0', 'StatusKey1', 'StatusKey2', 'StatusKey3']),
  summary: z.string().min(1, { message: "Summary is required" }),
});

/**
 * Schema for creating a new AISummary (omits system-generated ID)
 */
export const CreateAISummarySchema = AISummarySchema.omit({ id: true });

/**
 * Schema for updating an existing AISummary
 */
export const UpdateAISummarySchema = AISummarySchema;

export type AISummaryInput = z.infer<typeof AISummarySchema>;
export type CreateAISummaryInput = z.infer<typeof CreateAISummarySchema>;
export type UpdateAISummaryInput = z.infer<typeof UpdateAISummarySchema>;