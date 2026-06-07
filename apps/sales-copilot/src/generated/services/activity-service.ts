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
import { fetchActivityParticipants } from '@/lib/activity-party';

/** Participation only applies to appointment-backed activities. */
function supportsParticipants(type: ActivityType): boolean {
  return type === 'visit' || type === 'meeting';
}

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
  if (r.status !== undefined) {
    // Native activity statecode: 0=open, 1=completed, 2=canceled.
    dv.statecode = r.status === 'completed' ? 1 : r.status === 'canceled' ? 2 : 0;
  }
  if (r.scheduleddate !== undefined) {
    dv.scheduledstart = r.scheduleddate;
    // Set end = start + 1 hour for appointment
    if (type === 'visit' || type === 'meeting') {
      const start = new Date(r.scheduleddate);
      dv.scheduledend = new Date(start.getTime() + 3600000).toISOString();
    }
  }

  // Attendees: ActivityParty rows CANNOT be created directly (restricted table).
  // They must be deep-inserted via the appointment's party collection nav property.
  // participationtypemask: 5=Required, 6=Optional, 7=Organizer.
  if ((type === 'visit' || type === 'meeting') && r.contacts && r.contacts.length > 0) {
    const maskFor = (role?: string): number =>
      role === 'optional' ? 6 : role === 'organizer' ? 7 : 5;
    dv.appointment_activity_parties = r.contacts.map((c) => ({
      'partyid_contact@odata.bind': `/contacts(${c.id})`,
      participationtypemask: maskFor(c.role),
    }));
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
    const created = fromDv(result.data as ActivityEntityBase, type);
    // Attendees were deep-inserted via the appointment payload (appointment_activity_parties).
    if (supportsParticipants(type) && record.contacts && record.contacts.length > 0) {
      created.contacts = record.contacts;
    }
    return created;
  }

  /**
   * Update an existing activity.
   *
   * If type is omitted, try appointment/phonecall/email in order so callers
   * like useUpdateActivity (which only has id + changedFields) still work.
   */
  static async update(id: string, changedFields: Partial<Omit<Activity, 'id'>>, type?: ActivityType): Promise<Activity> {
    requireId(id, 'update', 'Activity');

    const tryOne = async (svc: ServiceClass, t: ActivityType): Promise<Activity | null> => {
      try {
        const dvPayload = toDv(changedFields, t);
        const result = await svc.update(id, dvPayload);
        if (!result.success || !result.data) return null;
        return fromDv(result.data as ActivityEntityBase, t);
      } catch {
        return null;
      }
    };

    if (type) {
      const { svc } = getService(type);
      const updated = await tryOne(svc, type);
      if (updated) {
        if (changedFields.contacts) updated.contacts = changedFields.contacts;
        return updated;
      }
      throw new Error('Activity update failed');
    }

    const candidates: Array<[ServiceClass, ActivityType]> = [
      [AppointmentEntityService, 'visit'],
      [PhonecallEntityService, 'call'],
      [EmailEntityService, 'email'],
    ];
    for (const [svc, t] of candidates) {
      const updated = await tryOne(svc, t);
      if (updated) {
        if (changedFields.contacts) updated.contacts = changedFields.contacts;
        return updated;
      }
    }
    throw new Error('Activity update failed');
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
        if (result.success && result.data) {
          const activity = fromDv(result.data as ActivityEntityBase, type);
          // Populate attendees for appointment-backed activities.
          if (supportsParticipants(type)) {
            const parties = await fetchActivityParticipants(id);
            if (parties.length > 0) {
              activity.contacts = parties.map((p) => ({ id: p.id, fullname: p.name, email: p.email, role: p.role }));
              // Appointment participants are attendees only — do NOT also set single contact.
            }
          }
          return activity;
        }
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