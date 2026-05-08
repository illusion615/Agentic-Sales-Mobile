import { z } from 'zod';

/**
 * Zod schema for Contact validation
 */
export const ContactSchema = z.object({
  id: z.string().uuid(),
  fullname: z.string().min(1, { message: "Full Name is required" }),
  account: z.object({ id: z.string().uuid(), name1: z.string() }),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
});

/**
 * Schema for creating a new Contact (omits system-generated ID)
 */
export const CreateContactSchema = ContactSchema.omit({ id: true });

/**
 * Schema for updating an existing Contact
 */
export const UpdateContactSchema = ContactSchema;

export type ContactInput = z.infer<typeof ContactSchema>;
export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;