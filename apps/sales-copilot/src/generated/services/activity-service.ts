import { Crf5c_activity1sService } from './Crf5c_activity1sService';
import type { Crf5c_activity1s } from '../models/Crf5c_activity1sModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Activity, ActivityDraftstatusKey, ActivityOutcomeKey, ActivityTypeKey } from '../models/activity-model';
import { dvToKey, keyToDv, mapOptions } from './_adapter-utils';

const FIELD_MAP: Record<string, string> = {
  id: 'crf5c_activity1id',
  title: 'crf5c_title',
  createdon: 'crf5c_createdon',
  notes: 'crf5c_notes',
  ownerid: 'crf5c_ownerid',
  scheduleddate: 'crf5c_scheduleddate',
};

function fromDv(dv: Crf5c_activity1s): Activity {
  const d = dv as unknown as Record<string, unknown>;
  return {
    id: dv.crf5c_activity1id,
    title: dv.crf5c_title,
    account: (d._crf5c_account_value as string)
      ? { id: d._crf5c_account_value as string, name1: (d.crf5c_accountname as string) ?? '' }
      : undefined,
    contact: (d._biz_contact_value as string)
      ? { id: d._biz_contact_value as string, fullname: (d.biz_contactname as string) ?? '' }
      : undefined,
    createdon: dv.crf5c_createdon,
    draftstatusKey: dvToKey('DraftstatusKey', dv.crf5c_draftstatus) as ActivityDraftstatusKey,
    notes: dv.crf5c_notes,
    opportunity: (d._crf5c_opportunity_value as string)
      ? { id: d._crf5c_opportunity_value as string, name1: (d.crf5c_opportunityname as string) ?? '' }
      : undefined,
    outcomeKey: dvToKey('OutcomeKey', dv.crf5c_outcome) as ActivityOutcomeKey | undefined,
    ownerid: dv.crf5c_ownerid,
    scheduleddate: dv.crf5c_scheduleddate,
    typeKey: dvToKey('TypeKey', dv.crf5c_type) as ActivityTypeKey,
  };
}

function toDv(r: Partial<Omit<Activity, 'id'>>): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.title !== undefined) dv.crf5c_title = r.title;
  if (r.account !== undefined) {
    dv['crf5c_Account@odata.bind'] = r.account?.id ? `/crf5c_account1s(${r.account.id})` : null;
  }
  if (r.contact !== undefined) {
    dv['biz_Contact@odata.bind'] = r.contact?.id ? `/crf5c_contacts(${r.contact.id})` : null;
  }
  if (r.draftstatusKey !== undefined) dv.crf5c_draftstatus = keyToDv(r.draftstatusKey);
  if (r.notes !== undefined) dv.crf5c_notes = r.notes;
  if (r.opportunity !== undefined) {
    dv['crf5c_Opportunity@odata.bind'] = r.opportunity?.id ? `/crf5c_opportunity1s(${r.opportunity.id})` : null;
  }
  if (r.outcomeKey !== undefined) dv.crf5c_outcome = keyToDv(r.outcomeKey);
  if (r.ownerid !== undefined) dv.crf5c_ownerid = r.ownerid;
  if (r.scheduleddate !== undefined) dv.crf5c_scheduleddate = r.scheduleddate;
  if (r.typeKey !== undefined) dv.crf5c_type = keyToDv(r.typeKey);
  return dv;
}

export class ActivityService {
  static async create(record: Omit<Activity, 'id'>): Promise<Activity> {
    const result = await Crf5c_activity1sService.create(toDv(record) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async update(id: string, changedFields: Partial<Omit<Activity, 'id'>>): Promise<Activity> {
    const result = await Crf5c_activity1sService.update(id, toDv(changedFields) as any);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async delete(id: string): Promise<void> {
    await Crf5c_activity1sService.delete(id);
  }

  static async get(id: string): Promise<Activity> {
    const result = await Crf5c_activity1sService.get(id);
    if (!result.success) throw result.error;
    return fromDv(result.data!);
  }

  static async getAll(options?: IGetAllOptions): Promise<Activity[]> {
    const result = await Crf5c_activity1sService.getAll(mapOptions(options, FIELD_MAP) as any);
    if (!result.success) throw result.error;
    return (result.data ?? []).map(fromDv);
  }
}