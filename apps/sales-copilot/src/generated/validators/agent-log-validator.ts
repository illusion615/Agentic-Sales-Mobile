import { z } from 'zod';

/**
 * Zod schema for AgentLog validation
 */
export const AgentLogSchema = z.object({
  id: z.string().uuid(),
  logName: z.string().min(1, { message: "Log Name is required" }),
  agentName: z.string().min(1, { message: "Agent Name is required" }),
  queryText: z.string().min(1, { message: "Query Text is required" }),
  responseText: z.string().optional(),
  sessionID: z.string().optional(),
  sourceDescription: z.string().optional(),
  timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").min(1, { message: "Timestamp is required" }),
});

/**
 * Schema for creating a new AgentLog (omits system-generated ID)
 */
export const CreateAgentLogSchema = AgentLogSchema.omit({ id: true });

/**
 * Schema for updating an existing AgentLog
 */
export const UpdateAgentLogSchema = AgentLogSchema;

export type AgentLogInput = z.infer<typeof AgentLogSchema>;
export type CreateAgentLogInput = z.infer<typeof CreateAgentLogSchema>;
export type UpdateAgentLogInput = z.infer<typeof UpdateAgentLogSchema>;