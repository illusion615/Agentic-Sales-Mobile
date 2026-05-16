import { z } from 'zod';

/**
 * Zod schema for Opportunity validation
 */
export const OpportunitySchema = z.object({
  id: z.string().uuid(),
  name1: z.string().min(1, { message: "Name is required" }),
  account: z.object({ id: z.string().uuid(), name1: z.string() }),
  blocker: z.string().optional(),
  closedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  confidence: z.number().int().optional(),
  confidencetrendKey: z.enum(['ConfidencetrendKey0', 'ConfidencetrendKey1', 'ConfidencetrendKey2']).optional(),
  createdon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  expectedclosedate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  lastaction: z.string().optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  stageKey: z.enum(['StageKey0', 'StageKey1', 'StageKey2', 'StageKey3', 'StageKey4', 'StageKey5']),
  totalamount: z.number(),
});

/**
 * Schema for creating a new Opportunity (omits system-generated ID)
 */
export const CreateOpportunitySchema = OpportunitySchema.omit({ id: true });

/**
 * Schema for updating an existing Opportunity
 */
export const UpdateOpportunitySchema = OpportunitySchema;

export type OpportunityInput = z.infer<typeof OpportunitySchema>;
export type CreateOpportunityInput = z.infer<typeof CreateOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof UpdateOpportunitySchema>;