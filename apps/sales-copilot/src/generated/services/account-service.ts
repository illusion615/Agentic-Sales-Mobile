/**
 * Account adapter service — maps native Dataverse `account` entity to the Account interface.
 */
import { AccountEntityService } from './AccountEntityService';
import type { AccountEntity } from '../models/AccountEntityModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Account } from '../models/account-model';
import { dvNum, numToDv, mapOptions, createWithReadback, requireId } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'accountid',
  name1: 'name',
  address: 'address1_composite',
  email: 'emailaddress1',
  industry: 'industrycode',
  latitude: 'address1_latitude',
  longitude: 'address1_longitude',
  notes: 'description',
  ownerid: '_ownerid_value',
  phone: 'telephone1',
};

function fromDv(dv: AccountEntity): Account {
  return {
    id: dv.accountid,
    name1: dv.name,
    address: dv.address1_composite ?? dv.address1_line1,
    email: dv.emailaddress1,
    industry: dv.industrycode != null ? String(dv.industrycode) : undefined,
    latitude: typeof dv.address1_latitude === 'number' ? dv.address1_latitude : undefined,
    longitude: typeof dv.address1_longitude === 'number' ? dv.address1_longitude : undefined,
    notes: dv.description,
    ownerid: (dv as unknown as Record<string, unknown>)._ownerid_value as string ?? '',
    phone: dv.telephone1,
  };
}

function toDv(r: Partial<Omit<Account, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.name1 !== undefined) dv.name = r.name1;
  if (r.address !== undefined) dv.address1_line1 = r.address;
  if (r.email !== undefined) dv.emailaddress1 = r.email;
  if (r.notes !== undefined) dv.description = r.notes;
  if (r.phone !== undefined) dv.telephone1 = r.phone;
  if (r.latitude !== undefined) dv.address1_latitude = r.latitude;
  if (r.longitude !== undefined) dv.address1_longitude = r.longitude;
  return dv;
}

export class AccountService {
  static async create(record: Omit<Account, 'id'>): Promise<Account> {
    const dvPayload = toDv(record);
    return createWithReadback(
      (p) => AccountEntityService.create(p as any),
      (o) => AccountEntityService.getAll(o),
      dvPayload, 'accountid', 'Account',
      `name eq '${(record.name1 ?? '').replace(/'/g, "''")}'`,
      fromDv,
    );
  }

  static async update(id: string, changedFields: Partial<Omit<Account, 'id'>>): Promise<Account> {
    requireId(id, 'update', 'Account');
    const result = await AccountEntityService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Account');
    await AccountEntityService.delete(id);
  }

  static async get(id: string): Promise<Account> {
    requireId(id, 'get', 'Account');
    const result = await AccountEntityService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Account[]> {
    const result = await AccountEntityService.getAll(mapOptions(options, FIELD_MAP) as any);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}