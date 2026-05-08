import { z } from 'zod';

/**
 * Zod schema for Activity validation
 */
export const ActivitySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, { message: "Title is required" }),
  account: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  createdon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  draftstatusKey: z.enum(['Draftstatuskey0', 'Draftstatuskey1', 'Draftstatuskey2', 'Draftstatuskey3']),
  notes: z.string().optional(),
  opportunity: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  outcomeKey: z.enum(['Outcomekey0', 'Outcomekey1', 'Outcomekey2', 'Outcomekey3', 'Outcomekey4']).optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  scheduleddate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Scheduled Date is required" }),
  typeKey: z.enum(['Typekey0', 'Typekey1', 'Typekey2', 'Typekey3', 'Typekey4']),
});

/**
 * Schema for creating a new Activity (omits system-generated ID)
 */
export const CreateActivitySchema = ActivitySchema.omit({ id: true });

/**
 * Schema for updating an existing Activity
 */
export const UpdateActivitySchema = ActivitySchema;

export type ActivityInput = z.infer<typeof ActivitySchema>;
export type CreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type UpdateActivityInput = z.infer<typeof UpdateActivitySchema>;