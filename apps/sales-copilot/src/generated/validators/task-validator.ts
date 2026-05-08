import { z } from 'zod';

/**
 * Zod schema for Task validation
 */
export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, { message: "Title is required" }),
  account: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  createdon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  duedate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Due Date is required" }),
  isoverdue: z.boolean().optional(),
  notes: z.string().optional(),
  opportunity: z.object({ id: z.string().uuid(), name1: z.string() }).optional(),
  overduereason: z.string().optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  priorityKey: z.enum(['Prioritykey0', 'Prioritykey1', 'Prioritykey2']).optional(),
  statusKey: z.enum(['Statuskey0', 'Statuskey1', 'Statuskey2', 'Statuskey3']).optional(),
});

/**
 * Schema for creating a new Task (omits system-generated ID)
 */
export const CreateTaskSchema = TaskSchema.omit({ id: true });

/**
 * Schema for updating an existing Task
 */
export const UpdateTaskSchema = TaskSchema;

export type TaskInput = z.infer<typeof TaskSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;