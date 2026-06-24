/**
 * Contact adapter service — maps native Dataverse `contact` entity to the Contact interface.
 */
import { ContactEntityService } from './ContactEntityService';
import type { ContactEntity } from '../models/ContactEntityModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Contact } from '../models/contact-model';
import { dvLookupName, mapOptions, createWithReadback, requireId, withActiveState } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'contactid',
  fullname: 'fullname',
  email: 'emailaddress1',
  phone: 'telephone1',
  title: 'jobtitle',
};

function fromDv(dv: ContactEntity): Contact {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.contactid,
    fullname: (dv.fullname ?? [dv.firstname, dv.lastname].filter(Boolean).join(' ')) || '',
    account: {
      id: (d._parentcustomerid_value as string) ?? '',
      name1: (d.parentcustomeridname as string) ?? dvLookupName(d, '_parentcustomerid_value'),
    },
    email: dv.emailaddress1,
    phone: dv.telephone1,
    title: dv.jobtitle,
  };
}

function toDv(r: Partial<Omit<Contact, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.fullname !== undefined) {
    // Native contact uses firstname/lastname; split fullname heuristically
    const parts = r.fullname.trim().split(/\s+/);
    dv.firstname = parts.slice(0, -1).join(' ') || parts[0] || '';
    dv.lastname = parts.length > 1 ? parts[parts.length - 1] : '';
  }
  // Bind to native account table (not custom crf5c_account1s)
  if (r.account?.id) dv['parentcustomerid_account@odata.bind'] = `/accounts(${r.account.id})`;
  if (r.email !== undefined) dv.emailaddress1 = r.email;
  if (r.phone !== undefined) dv.telephone1 = r.phone;
  if (r.title !== undefined) dv.jobtitle = r.title;
  return dv;
}

export class ContactService {
  static async create(record: Omit<Contact, 'id'>): Promise<Contact> {
    const dvPayload = toDv(record);
    return createWithReadback(
      (p) => ContactEntityService.create(p as any),
      (o) => ContactEntityService.getAll(o),
      dvPayload, 'contactid', 'Contact',
      `fullname eq '${(record.fullname ?? '').replace(/'/g, "''")}'`,
      fromDv,
    );
  }

  static async update(id: string, changedFields: Partial<Omit<Contact, 'id'>>): Promise<Contact> {
    requireId(id, 'update', 'Contact');
    const result = await ContactEntityService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    // Desktop SDK returns the updated record body; the mobile native player
    // returns success with NO body (like HTTP 204). Re-read so we never call
    // fromDv(undefined) — which would throw even though the write succeeded.
    if (result.data) return fromDv(result.data);
    return ContactService.get(id);
  }

  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Contact');
    await ContactEntityService.delete(id);
  }

  static async get(id: string): Promise<Contact> {
    requireId(id, 'get', 'Contact');
    const result = await ContactEntityService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Contact[]> {
    // Only read ACTIVE contacts: an Inactive contact is a soft-delete and must
    // not surface in lists or lookups.
    const result = await ContactEntityService.getAll(withActiveState(mapOptions(options, FIELD_MAP)) as any);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}