import { z } from 'zod';

/**
 * Zod schema for Setting validation
 */
export const SettingSchema = z.object({
  id: z.string().uuid(),
  settingKey: z.string().min(1, { message: "Setting Key is required" }),
  description: z.string().optional(),
  settingValue: z.string().min(1, { message: "Setting Value is required" }),
  updatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
});

/**
 * Schema for creating a new Setting (omits system-generated ID)
 */
export const CreateSettingSchema = SettingSchema.omit({ id: true });

/**
 * Schema for updating an existing Setting
 */
export const UpdateSettingSchema = SettingSchema;

export type SettingInput = z.infer<typeof SettingSchema>;
export type CreateSettingInput = z.infer<typeof CreateSettingSchema>;
export type UpdateSettingInput = z.infer<typeof UpdateSettingSchema>;