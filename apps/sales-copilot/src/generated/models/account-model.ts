/**
 * Account abstraction model — maps to native Dataverse `account` table.
 *
 * Removed fields (no longer stored, dynamically computed from activity data):
 *   - region, tier, creditStatus, paymentStatus, lastcontactedon, lastinteractiondate
 */

export interface Account {
  /** @displayName Account — GUID primary key */
  id: string;
  /** @displayName Name */
  name1: string;
  /** @displayName Address */
  address?: string;
  /** @displayName Address Line 1 */
  addressLine1?: string;
  /** @displayName City */
  addressCity?: string;
  /** @displayName State / Province */
  addressStateOrProvince?: string;
  /** @displayName Country */
  addressCountry?: string;
  /** @displayName Postal Code */
  addressPostalCode?: string;
  /** @displayName Email */
  email?: string;
  /** @displayName Industry */
  industry?: string;
  /** @displayName Website */
  website?: string;
  /** @displayName Latitude */
  latitude?: number;
  /** @displayName Longitude */
  longitude?: number;
  /** @displayName Notes / Description */
  notes?: string;
  /** @displayName Owner ID */
  ownerid: string;
  /** @displayName Phone */
  phone?: string;
}

export const _Account = 'Account' as const;