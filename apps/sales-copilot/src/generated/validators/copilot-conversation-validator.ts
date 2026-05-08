import { z } from 'zod';

/**
 * Zod schema for CopilotConversation validation
 */
export const CopilotConversationSchema = z.object({
  id: z.string().uuid(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  lastactiveon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Last Active On is required" }),
  messagesjson: z.string().min(1, { message: "Messages JSON is required" }),
  startedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Started On is required" }),
});

/**
 * Schema for creating a new CopilotConversation (omits system-generated ID)
 */
export const CreateCopilotConversationSchema = CopilotConversationSchema.omit({ id: true });

/**
 * Schema for updating an existing CopilotConversation
 */
export const UpdateCopilotConversationSchema = CopilotConversationSchema;

export type CopilotConversationInput = z.infer<typeof CopilotConversationSchema>;
export type CreateCopilotConversationInput = z.infer<typeof CreateCopilotConversationSchema>;
export type UpdateCopilotConversationInput = z.infer<typeof UpdateCopilotConversationSchema>;