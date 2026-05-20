import { Crf5c_account1sService } from './Crf5c_account1sService';
import type { Crf5c_account1s } from '../models/Crf5c_account1sModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Account, AccountCreditstatusKey, AccountPaymentstatusKey, AccountRegionKey, AccountTierKey } from '../models/account-model';
import { dvToKey, keyToDv, dvNum, numToDv } from './_adapter-utils';

function fromDv(dv: Crf5c_account1s): Account {
  return {
    id: dv.crf5c_account1id,
    name1: dv.crf5c_name,
    address: dv.crf5c_address,
    creditstatusKey: dvToKey('CreditstatusKey', dv.crf5c_creditstatus) as AccountCreditstatusKey | undefined,
    email: dv.crf5c_email,
    industry: dv.crf5c_industry,
    lastcontactedon: dv.crf5c_lastcontactedon,
    lastinteractiondate: dv.crf5c_lastinteractiondate,
    latitude: dvNum(dv.crf5c_latitude),
    longitude: dvNum(dv.crf5c_longitude),
    notes: dv.crf5c_notes,
    ownerid: dv.crf5c_ownerid,
    paymentstatusKey: dvToKey('PaymentstatusKey', dv.crf5c_paymentstatus) as AccountPaymentstatusKey | undefined,
    phone: dv.crf5c_phone,
    regionKey: dvToKey('RegionKey', dv.crf5c_region) as AccountRegionKey | undefined,
    tierKey: dvToKey('TierKey', dv.crf5c_tier) as AccountTierKey | undefined,
  };
}

function toDv(r: Partial<Omit<Account, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.name1 !== undefined) dv.crf5c_name = r.name1;
  if (r.address !== undefined) dv.crf5c_address = r.address;
  if (r.creditstatusKey !== undefined) dv.crf5c_creditstatus = keyToDv(r.creditstatusKey);
  if (r.email !== undefined) dv.crf5c_email = r.email;
  if (r.industry !== undefined) dv.crf5c_industry = r.industry;
  if (r.lastcontactedon !== undefined) dv.crf5c_lastcontactedon = r.lastcontactedon;
  if (r.lastinteractiondate !== undefined) dv.crf5c_lastinteractiondate = r.lastinteractiondate;
  if (r.latitude !== undefined) dv.crf5c_latitude = numToDv(r.latitude);
  if (r.longitude !== undefined) dv.crf5c_longitude = numToDv(r.longitude);
  if (r.notes !== undefined) dv.crf5c_notes = r.notes;
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.paymentstatusKey !== undefined) dv.crf5c_paymentstatus = keyToDv(r.paymentstatusKey);
  if (r.phone !== undefined) dv.crf5c_phone = r.phone;
  if (r.regionKey !== undefined) dv.crf5c_region = keyToDv(r.regionKey);
  if (r.tierKey !== undefined) dv.crf5c_tier = keyToDv(r.tierKey);
  return dv;
}

export class AccountService {
  static async create(record: Omit<Account, 'id'>): Promise<Account> {
    const result = await Crf5c_account1sService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<Account, 'id'>>): Promise<Account> {
    const result = await Crf5c_account1sService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_account1sService.delete(id);
  }

  static async get(id: string): Promise<Account> {
    const result = await Crf5c_account1sService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Account[]> {
    const result = await Crf5c_account1sService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}