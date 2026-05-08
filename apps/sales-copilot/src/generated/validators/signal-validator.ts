import { z } from 'zod';

/**
 * Zod schema for Signal validation
 */
export const SignalSchema = z.object({
  id: z.string().uuid(),
  signaltype: z.string().min(1, { message: "Signal Type is required" }),
  account: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  description: z.string().optional(),
  detectedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Detected On is required" }),
  isactive: z.boolean().optional(),
  opportunity: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  relateddatajson: z.string().optional(),
  severityKey: z.enum(['Severitykey0', 'Severitykey1', 'Severitykey2', 'Severitykey3']).optional(),
  title: z.string().min(1, { message: "Title is required" }),
});

/**
 * Schema for creating a new Signal (omits system-generated ID)
 */
export const CreateSignalSchema = SignalSchema.omit({ id: true });

/**
 * Schema for updating an existing Signal
 */
export const UpdateSignalSchema = SignalSchema;

export type SignalInput = z.infer<typeof SignalSchema>;
export type CreateSignalInput = z.infer<typeof CreateSignalSchema>;
export type UpdateSignalInput = z.infer<typeof UpdateSignalSchema>;