import { z } from 'zod';

/**
 * Zod schema for Account validation
 */
export const AccountSchema = z.object({
  id: z.string().uuid(),
  name1: z.string().min(1, { message: "Name is required" }),
  address: z.string().optional(),
  creditstatusKey: z.enum(['CreditstatusKey0', 'CreditstatusKey1', 'CreditstatusKey2']).optional(),
  email: z.string().email().optional(),
  industry: z.string().optional(),
  lastcontactedon: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  lastinteractiondate: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "DateTime must be in ISO format").optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().optional(),
  ownerid: z.string().min(1, { message: "Owner ID is required" }),
  paymentstatusKey: z.enum(['PaymentstatusKey0', 'PaymentstatusKey1', 'PaymentstatusKey2']).optional(),
  phone: z.string().optional(),
  regionKey: z.enum(['RegionKey0', 'RegionKey1', 'RegionKey2', 'RegionKey3']).optional(),
  tierKey: z.enum(['TierKey0', 'TierKey1', 'TierKey2', 'TierKey3']).optional(),
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