import { Crf5c_contactsService } from './Crf5c_contactsService';
import type { Crf5c_contacts } from '../models/Crf5c_contactsModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Contact } from '../models/contact-model';

function fromDv(dv: Crf5c_contacts): Contact {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_contactid,
    fullname: dv.crf5c_fullname,
    account: {
      id: (d._crf5c_account_value as string) ?? '',
      name1: (d.crf5c_accountname as string) ?? '',
    },
    email: dv.crf5c_email,
    phone: dv.crf5c_phone,
    title: dv.crf5c_title,
  };
}

function toDv(r: Partial<Omit<Contact, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.fullname !== undefined) dv.crf5c_fullname = r.fullname;
  if (r.account?.id) dv['crf5c_Account@odata.bind'] = `/crf5c_account1s(${r.account.id})`;
  if (r.email !== undefined) dv.crf5c_email = r.email;
  if (r.phone !== undefined) dv.crf5c_phone = r.phone;
  if (r.title !== undefined) dv.crf5c_title = r.title;
  return dv;
}

export class ContactService {
  static async create(record: Omit<Contact, 'id'>): Promise<Contact> {
    const result = await Crf5c_contactsService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<Contact, 'id'>>): Promise<Contact> {
    const result = await Crf5c_contactsService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_contactsService.delete(id);
  }

  static async get(id: string): Promise<Contact> {
    const result = await Crf5c_contactsService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Contact[]> {
    const result = await Crf5c_contactsService.getAll(options);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}