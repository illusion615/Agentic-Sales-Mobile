/*!
 * Native Dataverse Account entity model.
 * Maps to the standard `accounts` entity set (logical name: `account`).
 */

export const AccountStatecode = {
  0: 'Active',
  1: 'Inactive'
} as const;
export type AccountStatecode = keyof typeof AccountStatecode;

export const AccountStatuscode = {
  1: 'Active',
  2: 'Inactive'
} as const;
export type AccountStatuscode = keyof typeof AccountStatuscode;

export interface AccountBase {
  accountid: string;
  name: string;
  emailaddress1?: string;
  telephone1?: string;
  description?: string;
  industrycode?: number;
  address1_composite?: string;
  address1_line1?: string;
  address1_city?: string;
  address1_stateorprovince?: string;
  address1_country?: string;
  address1_postalcode?: string;
  address1_latitude?: number;
  address1_longitude?: number;
  statecode: AccountStatecode;
  statuscode?: AccountStatuscode;
}

export interface AccountEntity extends AccountBase {
  createdon?: string;
  modifiedon?: string;
  _ownerid_value?: string;
  owneridname?: string;
  versionnumber?: string;
}
