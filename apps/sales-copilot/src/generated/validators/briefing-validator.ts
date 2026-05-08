import { z } from 'zod';

/**
 * Zod schema for Briefing validation
 */
export const BriefingSchema = z.object({
  id: z.string().uuid(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  audiourl: z.string().optional(),
  generatedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Generated On is required" }),
  lastposition: z.number().optional(),
  payloadjson: z.string().min(1, { message: "Payload JSON is required" }),
});

/**
 * Schema for creating a new Briefing (omits system-generated ID)
 */
export const CreateBriefingSchema = BriefingSchema.omit({ id: true });

/**
 * Schema for updating an existing Briefing
 */
export const UpdateBriefingSchema = BriefingSchema;

export type BriefingInput = z.infer<typeof BriefingSchema>;
export type CreateBriefingInput = z.infer<typeof CreateBriefingSchema>;
export type UpdateBriefingInput = z.infer<typeof UpdateBriefingSchema>;