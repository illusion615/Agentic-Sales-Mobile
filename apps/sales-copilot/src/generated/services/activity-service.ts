/**
 * Activity adapter service — routes to native appointment / phonecall / email tables.
 *
 * Read: queries all three tables in parallel, merges, sorts by scheduleddate desc.
 * Write: routes to the correct table based on activity type.
 *
 * regardingobjectid: points to opportunity (if present) or account.
 * Account is derived from opportunity when regarding points to an opp.
 */
import { AppointmentEntityService, PhonecallEntityService, EmailEntityService } from './ActivityEntityService';
import type { ActivityEntityBase } from '../models/ActivityEntityModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Activity, ActivityType } from '../models/activity-model';
import { requireId } from './_adapter-utils';

// Map native table → activity type
const TABLE_TYPE_MAP: Record<string, ActivityType> = {
  appointment: 'visit',  // default; could be 'meeting' but we unify
  phonecall: 'call',
  email: 'email',
};

function statusFromCode(code?: number): 'open' | 'completed' | 'canceled' {
  if (code === 1) return 'completed';
  if (code === 2) return 'canceled';
  return 'open';
}

function fromDv(dv: ActivityEntityBase, type: ActivityType): Activity {
  const d = dv as unknown as Record<string, unknown>;
  const regardingType = (d.regardingobjectidtypecode ?? d['_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname']) as string | undefined;
  const regardingId = (d._regardingobjectid_value as string) ?? '';
  const regardingName = (d.regardingobjectidname ?? d['_regardingobjectid_value@OData.Community.Display.V1.FormattedValue']) as string ?? '';

  let account: Activity['account'];
  let opportunity: Activity['opportunity'];

  if (regardingType === 'opportunity') {
    opportunity = { id: regardingId, name1: regardingName };
    // Account will be resolved by the UI from the opportunity record
  } else if (regardingType === 'account') {
    account = { id: regardingId, name1: regardingName };
  }

  return {
    id: dv.activityid,
    title: dv.subject ?? '',
    type,
    account,
    opportunity,
    contact: undefined, // Activity Party requires separate query; omit for now
    notes: dv.description,
    scheduleddate: dv.scheduledstart ?? dv.createdon ?? '',
    status: statusFromCode(dv.statecode),
    ownerid: (d._ownerid_value as string) ?? '',
    createdon: dv.createdon,
  };
}

type ServiceClass = typeof AppointmentEntityService | typeof PhonecallEntityService | typeof EmailEntityService;

function getService(type: ActivityType): { svc: ServiceClass; tableName: string } {
  switch (type) {
    case 'visit':
    case 'meeting':
      return { svc: AppointmentEntityService, tableName: 'appointments' };
    case 'call':
      return { svc: PhonecallEntityService, tableName: 'phonecalls' };
    case 'email':
      return { svc: EmailEntityService, tableName: 'emails' };
  }
}

function toDv(r: Partial<Omit<Activity, 'id'>>, type: ActivityType): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.title !== undefined) dv.subject = r.title;
  if (r.notes !== undefined) dv.description = r.notes;
  if (r.scheduleddate !== undefined) {
    dv.scheduledstart = r.scheduleddate;
    // Set end = start + 1 hour for appointment
    if (type === 'visit' || type === 'meeting') {
      const start = new Date(r.scheduleddate);
      dv.scheduledend = new Date(start.getTime() + 3600000).toISOString();
    }
  }

  // regardingobjectid: prefer opportunity, fallback to account
  if (r.opportunity?.id) {
    dv['regardingobjectid_opportunity@odata.bind'] = `/opportunities(${r.opportunity.id})`;
  } else if (r.account?.id) {
    dv['regardingobjectid_account@odata.bind'] = `/accounts(${r.account.id})`;
  }

  return dv;
}

export class ActivityService {
  /** Create a new activity in the correct native table. */
  static async create(record: Omit<Activity, 'id'>): Promise<Activity> {
    const type = (record.type || 'visit') as ActivityType;
    const { svc } = getService(type);
    const dvPayload = toDv(record, type);
    const result = await svc.create(dvPayload);
    if (!result.success) throw result.error ?? new Error('Activity create failed');
    return fromDv(result.data as ActivityEntityBase, type);
  }

  /** Update an existing activity. Caller must know the type. */
  static async update(id: string, changedFields: Partial<Omit<Activity, 'id'>>, type: ActivityType = 'visit'): Promise<Activity> {
    requireId(id, 'update', 'Activity');
    const { svc } = getService(type);
    const dvPayload = toDv(changedFields, type);
    const result = await svc.update(id, dvPayload);
    if (!result.success) throw result.error ?? new Error('Activity update failed');
    return fromDv(result.data as ActivityEntityBase, type);
  }

  /** Delete an activity. Tries appointment first, then phonecall, then email. */
  static async delete(id: string): Promise<void> {
    requireId(id, 'delete', 'Activity');
    // Try each table — only one will have this id
    for (const svc of [AppointmentEntityService, PhonecallEntityService, EmailEntityService]) {
      try {
        await svc.delete(id);
        return;
      } catch { /* not in this table, try next */ }
    }
    throw new Error(`Activity ${id} not found in any table`);
  }

  /** Get a single activity by id. Tries each table until found. */
  static async get(id: string): Promise<Activity> {
    requireId(id, 'get', 'Activity');
    const tables: Array<[ServiceClass, ActivityType]> = [
      [AppointmentEntityService, 'visit'],
      [PhonecallEntityService, 'call'],
      [EmailEntityService, 'email'],
    ];
    for (const [svc, type] of tables) {
      try {
        const result = await svc.get(id);
        if (result.success && result.data) return fromDv(result.data as ActivityEntityBase, type);
      } catch { /* not in this table */ }
    }
    throw new Error(`Activity ${id} not found`);
  }

  /** Get all activities — queries all three tables in parallel and merges. */
  static async getAll(options?: IGetAllOptions): Promise<Activity[]> {
    const [appts, calls, emails] = await Promise.all([
      AppointmentEntityService.getAll(options).catch(() => ({ success: true, data: [] as ActivityEntityBase[] })),
      PhonecallEntityService.getAll(options).catch(() => ({ success: true, data: [] as ActivityEntityBase[] })),
      EmailEntityService.getAll(options).catch(() => ({ success: true, data: [] as ActivityEntityBase[] })),
    ]);

    const all: Activity[] = [
      ...(appts.data ?? []).map((d) => fromDv(d as ActivityEntityBase, 'visit')),
      ...(calls.data ?? []).map((d) => fromDv(d as ActivityEntityBase, 'call')),
      ...(emails.data ?? []).map((d) => fromDv(d as ActivityEntityBase, 'email')),
    ];

    // Sort by scheduleddate descending (most recent first)
    all.sort((a, b) => {
      const ta = a.scheduleddate ? new Date(a.scheduleddate).getTime() : 0;
      const tb = b.scheduleddate ? new Date(b.scheduleddate).getTime() : 0;
      return tb - ta;
    });

    return all;
  }
}