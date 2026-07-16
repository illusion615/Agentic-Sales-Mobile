/**
 * Activity adapter service — routes to native appointment / phonecall / email tables.
 *
 * Read: queries all three tables in parallel, merges, sorts by scheduleddate desc.
 * Write: routes to the correct table based on activity type.
 *
 * regardingobjectid: points to the custom opportunity table when present,
 * otherwise account. The custom opportunity table must have activities enabled.
 */
import { AppointmentEntityService, PhonecallEntityService, EmailEntityService } from './ActivityEntityService';
import type { ActivityEntityBase } from '../models/ActivityEntityModel';
import type { IGetAllOptions } from '../models/CommonModels';
import type { Activity, ActivityType } from '../models/activity-model';
import { requireId, withReadTimeout } from './_adapter-utils';
import { fetchActivityParticipants, fetchPrimaryActivityContact } from '@/lib/activity-party';

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

  if (regardingType === 'crf5c_opportunity1' || regardingType === 'opportunity') {
    opportunity = { id: regardingId, name1: regardingName };
    // Account will be resolved by the UI from the opportunity record
  } else if (regardingType === 'account') {
    account = { id: regardingId, name1: regardingName };
  } else if (regardingType === 'contact') {
    // The related account is resolved by the shared UI relationship boundary
    // from Contact.account, just as opportunity-backed activities use
    // Opportunity.account.
    return {
      id: dv.activityid,
      title: dv.subject ?? '',
      type,
      contact: { id: regardingId, fullname: regardingName },
      notes: dv.description,
      scheduleddate: dv.scheduledstart ?? dv.createdon ?? '',
      durationMinutes: d.scheduleddurationminutes as number | undefined,
      status: statusFromCode(dv.statecode),
      ownerid: (d._ownerid_value as string) ?? '',
      createdon: dv.createdon,
    };
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
    durationMinutes: d.scheduleddurationminutes as number | undefined,
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

function activityPartyCollection(type: ActivityType): string | undefined {
  if (type === 'visit' || type === 'meeting') return 'appointment_activity_parties';
  if (type === 'call') return 'phonecall_activity_parties';
  if (type === 'email') return 'email_activity_parties';
  return undefined;
}

function toDv(r: Partial<Omit<Activity, 'id'>>, type: ActivityType): Record<string, unknown> {
  const dv: Record<string, unknown> = {};
  if (r.title !== undefined) dv.subject = r.title;
  if (r.notes !== undefined) dv.description = r.notes;
  if (r.status !== undefined) {
    // Native activity statecode/statuscode. Setting statecode ALONE is unreliable
    // on activity tables (an appointment silently keeps its old state), so pair
    // each state with the matching default status reason for its native table:
    //   appointment(visit/meeting) open=1 completed=3 canceled=4
    //   phonecall(call)            open=1 completed=2 canceled=3
    //   email                      open=1 completed=3 canceled=5
    const nativeTable: 'appointment' | 'phonecall' | 'email' =
      type === 'call' ? 'phonecall' : type === 'email' ? 'email' : 'appointment';
    const REASON = {
      appointment: { open: 1, completed: 3, canceled: 4 },
      phonecall: { open: 1, completed: 2, canceled: 3 },
      email: { open: 1, completed: 3, canceled: 5 },
    } as const;
    if (r.status === 'completed') {
      dv.statecode = 1;
      dv.statuscode = REASON[nativeTable].completed;
    } else if (r.status === 'canceled') {
      dv.statecode = 2;
      dv.statuscode = REASON[nativeTable].canceled;
    } else {
      dv.statecode = 0;
      dv.statuscode = REASON[nativeTable].open;
    }
  }
  if (r.scheduleddate !== undefined) {
    dv.scheduledstart = r.scheduleddate;
    // Persist the chosen duration natively (all three tables expose it) and keep
    // the appointment end consistent with start + duration (was a hard-coded 1h).
    const durationMin = r.durationMinutes && r.durationMinutes > 0 ? r.durationMinutes : 60;
    dv.scheduleddurationminutes = durationMin;
    if (type === 'visit' || type === 'meeting') {
      const start = new Date(r.scheduleddate);
      dv.scheduledend = new Date(start.getTime() + durationMin * 60000).toISOString();
    }
  } else if (r.durationMinutes !== undefined && r.durationMinutes > 0) {
    // Duration-only edit: keep the native duration field in sync.
    dv.scheduleddurationminutes = r.durationMinutes;
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

  if ((type === 'call' || type === 'email') && r.contact?.id) {
    const partyCollection = activityPartyCollection(type);
    if (partyCollection) {
      dv[partyCollection] = [
        {
          'partyid_contact@odata.bind': `/contacts(${r.contact.id})`,
          participationtypemask: 2,
        },
      ];
    }
  }

  if (r.opportunity?.id) {
    dv['regardingobjectid_crf5c_opportunity1@odata.bind'] = `/crf5c_opportunity1s(${r.opportunity.id})`;
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
    const requestedStatus = record.status;
    // Dataverse validates a new native activity in Open state before it accepts
    // a closed status reason. Creating directly as Completed/Canceled fails with
    // 0x80048408, so closed records use a compensated two-phase transition.
    const createRecord = requestedStatus === 'open'
      ? record
      : { ...record, status: 'open' as const };
    const dvPayload = toDv(createRecord, type);
    const result = await svc.create(dvPayload);
    if (!result.success) throw result.error ?? new Error('Activity create failed');
    const created = fromDv(result.data as ActivityEntityBase, type);
    if (!created.id) {
      throw new Error(`Activity create succeeded without an id for ${type}`);
    }

    if (requestedStatus !== 'open') {
      try {
        const transition = await svc.update(created.id, toDv({ status: requestedStatus }, type));
        if (!transition.success) {
          throw transition.error ?? new Error(`Activity status transition to ${requestedStatus} failed`);
        }
        created.status = requestedStatus;
      } catch (transitionError) {
        try {
          await svc.delete(created.id);
        } catch (cleanupError) {
          // Keep this ES2017-compatible: AggregateError/Error.cause are newer
          // built-ins and are not guaranteed on supported legacy WebViews.
          const error = new Error(
            `Activity ${created.id} could not transition to ${requestedStatus}, and compensation delete failed`,
          ) as Error & { transitionError?: unknown; cleanupError?: unknown };
          error.transitionError = transitionError;
          error.cleanupError = cleanupError;
          throw error;
        }
        throw transitionError;
      }
    }

    // Attendees were deep-inserted via the appointment payload (appointment_activity_parties).
    if (supportsParticipants(type) && record.contacts && record.contacts.length > 0) {
      created.contacts = record.contacts;
    } else if (!supportsParticipants(type) && record.contact) {
      created.contact = record.contact;
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

    // When probing tables blindly (no type), a write to the WRONG table fails
    // with a not-found error that we must swallow and keep trying. But a write
    // to the RIGHT table that fails for a real reason (e.g. an invalid statecode/
    // statuscode transition, a permission error) must NOT be masked behind the
    // generic "Activity update failed" — capture it and rethrow so it surfaces.
    const isNotFound = (e: unknown): boolean => {
      const msg = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
      return msg.includes('not found') || msg.includes('resourcenotfound') ||
        msg.includes('does not exist') || msg.includes('404');
    };
    let lastRealError: unknown = null;

    // Synthesize a result Activity from the write input. The desktop SDK returns
    // the updated record body, but the mobile native player's updateRecordAsync
    // returns success with NO representation body (like HTTP 204). In that case
    // the write DID succeed — we must not treat an empty body as failure, or the
    // probe falls through and throws "Activity update failed" even though the row
    // was updated. Build a best-effort object from id + changedFields so callers
    // (which mostly invalidate queries and refetch) get a non-null success value.
    const synthFromInput = (t: ActivityType): Activity => ({
      id,
      title: changedFields.title ?? '',
      type: t,
      account: changedFields.account,
      opportunity: changedFields.opportunity,
      contact: changedFields.contact,
      contacts: changedFields.contacts,
      notes: changedFields.notes,
      scheduleddate: changedFields.scheduleddate ?? '',
      durationMinutes: changedFields.durationMinutes,
      status: changedFields.status ?? 'open',
      ownerid: changedFields.ownerid ?? '',
      createdon: undefined,
    });

    const tryOne = async (svc: ServiceClass, t: ActivityType): Promise<Activity | null> => {
      try {
        const dvPayload = toDv(changedFields, t);
        const result = await svc.update(id, dvPayload);
        if (!result.success) {
          // A wrong-table write fails as not-found — swallow and keep probing.
          // A real failure on the right table is captured and rethrown later.
          if (result.error && !isNotFound(result.error)) lastRealError = result.error;
          return null;
        }
        // Success. The right table is the only one that returns success (wrong
        // tables 404). Use the returned body when present (desktop); otherwise
        // synthesize from input (mobile native player returns no body).
        const data = result.data as ActivityEntityBase | undefined;
        if (data && (data as unknown as { activityid?: string }).activityid) {
          return fromDv(data, t);
        }
        return synthFromInput(t);
      } catch (e) {
        if (!isNotFound(e)) lastRealError = e;
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
      if (lastRealError) throw lastRealError instanceof Error ? lastRealError : new Error(String(lastRealError));
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
    if (lastRealError) throw lastRealError instanceof Error ? lastRealError : new Error(String(lastRealError));
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
          if (supportsParticipants(type)) {
            const parties = await fetchActivityParticipants(id);
            if (parties.length > 0) {
              activity.contacts = parties.map((p) => ({
                id: p.id,
                fullname: p.name,
                email: p.email,
                role: p.role === 'optional' || p.role === 'organizer' ? p.role : 'required',
              }));
              // Appointment participants are attendees only — do NOT also set single contact.
            }
          } else {
            const contact = await fetchPrimaryActivityContact(id);
            if (contact) activity.contact = { id: contact.id, fullname: contact.name };
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
      withReadTimeout(AppointmentEntityService.getAll(options), 'Activity.appointments').catch(() => ({ success: true, data: [] as ActivityEntityBase[] })),
      withReadTimeout(PhonecallEntityService.getAll(options), 'Activity.phonecalls').catch(() => ({ success: true, data: [] as ActivityEntityBase[] })),
      withReadTimeout(EmailEntityService.getAll(options), 'Activity.emails').catch(() => ({ success: true, data: [] as ActivityEntityBase[] })),
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