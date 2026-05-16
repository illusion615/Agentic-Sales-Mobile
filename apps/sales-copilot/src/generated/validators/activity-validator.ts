import { z } from 'zod';

/**
 * Zod schema for Activity validation
 */
export const ActivitySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, { message: "Title is required" }),
  account: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  contact: z.object({ id: z.string().uuid(), fullname: z.string() }).optional(),
  createdon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  draftstatusKey: z.enum(['DraftstatusKey0', 'DraftstatusKey1', 'DraftstatusKey2', 'DraftstatusKey3']),
  notes: z.string().optional(),
  opportunity: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  outcomeKey: z.enum(['OutcomeKey0', 'OutcomeKey1', 'OutcomeKey2', 'OutcomeKey3', 'OutcomeKey4']).optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  scheduleddate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Scheduled Date is required" }),
  typeKey: z.enum(['TypeKey0', 'TypeKey1', 'TypeKey2', 'TypeKey3', 'TypeKey4']),
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