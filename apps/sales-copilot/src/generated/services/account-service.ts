import { Crf5c_account1sService } from './Crf5c_account1sService';
import {
  type Crf5c_account1s,
  Crf5c_account1scrf5c_creditstatus,
  Crf5c_account1scrf5c_paymentstatus,
  Crf5c_account1scrf5c_region,
  Crf5c_account1scrf5c_tier,
} from '../models/Crf5c_account1sModel';
import type { IGetAllOptions } from '../models/CommonModels';
import {
  AccountCreditstatusKeyToLabel,
  AccountPaymentstatusKeyToLabel,
  AccountRegionKeyToLabel,
  AccountTierKeyToLabel,
  type Account,
} from '../models/account-model';
import { labelToDv, dvNum, numToDv, dvChoice, requireCreated, requireId } from './_adapter-utils';

function fromDv(dv: Crf5c_account1s): Account {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_account1id,
    name1: dv.crf5c_name,
    address: dv.crf5c_address,
    creditStatus: dvChoice(d, 'crf5c_creditstatus', Crf5c_account1scrf5c_creditstatus),
    email: dv.crf5c_email,
    industry: dv.crf5c_industry,
    lastcontactedon: dv.crf5c_lastcontactedon,
    lastinteractiondate: dv.crf5c_lastinteractiondate,
    latitude: dvNum(dv.crf5c_latitude),
    longitude: dvNum(dv.crf5c_longitude),
    notes: dv.crf5c_notes,
    ownerid: dv.crf5c_ownerid,
    paymentStatus: dvChoice(d, 'crf5c_paymentstatus', Crf5c_account1scrf5c_paymentstatus),
    phone: dv.crf5c_phone,
    region: dvChoice(d, 'crf5c_region', Crf5c_account1scrf5c_region),
    tier: dvChoice(d, 'crf5c_tier', Crf5c_account1scrf5c_tier),
  };
}

function toDv(r: Partial<Omit<Account, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.name1 !== undefined) dv.crf5c_name = r.name1;
  if (r.address !== undefined) dv.crf5c_address = r.address;
  if (r.creditStatus !== undefined) dv.crf5c_creditstatus = labelToDv(AccountCreditstatusKeyToLabel, r.creditStatus);
  if (r.email !== undefined) dv.crf5c_email = r.email;
  if (r.industry !== undefined) dv.crf5c_industry = r.industry;
  if (r.lastcontactedon !== undefined) dv.crf5c_lastcontactedon = r.lastcontactedon;
  if (r.lastinteractiondate !== undefined) dv.crf5c_lastinteractiondate = r.lastinteractiondate;
  if (r.latitude !== undefined) dv.crf5c_latitude = numToDv(r.latitude);
  if (r.longitude !== undefined) dv.crf5c_longitude = numToDv(r.longitude);
  if (r.notes !== undefined) dv.crf5c_notes = r.notes;
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.paymentStatus !== undefined) dv.crf5c_paymentstatus = labelToDv(AccountPaymentstatusKeyToLabel, r.paymentStatus);
  if (r.phone !== undefined) dv.crf5c_phone = r.phone;
  if (r.region !== undefined) dv.crf5c_region = labelToDv(AccountRegionKeyToLabel, r.region);
  if (r.tier !== undefined) dv.crf5c_tier = labelToDv(AccountTierKeyToLabel, r.tier);
  return dv;
}

export class AccountService {
  static async create(record: Omit<Account, 'id'>): Promise<Account> {
    const result = await Crf5c_account1sService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(requireCreated(result.data, 'crf5c_account1id', 'Account'));
  }

  static async update(id: string, changedFields: Partial<Omit<Account, 'id'>>): Promise<Account> {
    requireId(id, 'update', 'Account');
    const result = await Crf5c_account1sService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Account');
    await Crf5c_account1sService.delete(id);
  }

  static async get(id: string): Promise<Account> {
    requireId(id, 'get', 'Account');
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