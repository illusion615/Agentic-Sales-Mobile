import { z } from 'zod';

/**
 * Zod schema for Account validation
 */
export const AccountSchema = z.object({
  id: z.string().uuid(),
  name1: z.string().min(1, { message: "Name is required" }),
  address: z.string().optional(),
  creditstatusKey: z.enum(['Creditstatuskey0', 'Creditstatuskey1', 'Creditstatuskey2']).optional(),
  email: z.string().email().optional(),
  industry: z.string().optional(),
  lastcontactedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  lastinteractiondate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  paymentstatusKey: z.enum(['Paymentstatuskey0', 'Paymentstatuskey1', 'Paymentstatuskey2']).optional(),
  phone: z.string().optional(),
  regionKey: z.enum(['Regionkey0', 'Regionkey1', 'Regionkey2', 'Regionkey3']).optional(),
  tierKey: z.enum(['Tierkey0', 'Tierkey1', 'Tierkey2', 'Tierkey3']).optional(),
});

/**
 * Schema for creating a new Account (omits system-generated ID)
 */
export const CreateAccountSchema = AccountSchema.omit({ id: true });

/**
 * Schema for updating an existing Account
 */
export const UpdateAccountSchema = AccountSchema;

export type AccountInput = z.infer<typeof AccountSchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;