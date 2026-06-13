/**
 * Activity participant (activityparty) READ adapter.
 *
 * VERIFIED against live Dataverse (2026-06-07):
 *  - ActivityParty rows CANNOT be created via a direct POST to /activityparties.
 *    Attendees must be deep-inserted on the parent appointment via the
 *    `appointment_activity_parties` collection navigation property. That write
 *    lives in activity-service.ts `toDv()`. PATCH on the appointment with the
 *    same array REPLACES the whole party set (verified).
 *  - On read, activityparty exposes NO `partyidname` and NO `partyobjecttypecode`
 *    (confirmed via Web API $select errors). Available fields include
 *    `_partyid_value`, `participationtypemask`, `addressused`, `ispartydeleted`.
 *  - The platform auto-adds an Owner party (participationtypemask = 9). Real
 *    attendees use 5 (Required), 6 (Optional), 7 (Organizer) — filter on those.
 *
 * Since activityparty has no name column, names are resolved from the contacts.
 */
import { ActivitypartiesService } from '@/generated/services/ActivitypartiesService';
import type { Activityparties } from '@/generated/models/ActivitypartiesModel';

/** Participation roles used for meeting/visit attendees. */
export const PARTICIPATION = {
  sender: 1,
  toRecipient: 2,
  required: 5,
  optional: 6,
  organizer: 7,
} as const;

export type ParticipationRole = keyof typeof PARTICIPATION;

/** Masks representing real attendees (excludes auto-added Owner=9, Regarding=8, etc.). */
const ATTENDEE_MASKS = new Set<number>([5, 6, 7]);
const PRIMARY_CONTACT_MASKS = new Set<number>([1, 2]);

/** A resolved participant on an activity. */
export interface ActivityParticipant {
  /** contact id (partyid) */
  id: string;
  /** display name (resolved from contacts; falls back to email/id) */
  name: string;
  /** email alias used for this party (addressused) */
  email?: string;
  /** participation role */
  role: ParticipationRole;
}

function roleFromMask(mask?: number): ParticipationRole {
  switch (mask) {
    case PARTICIPATION.sender: return 'sender';
    case PARTICIPATION.toRecipient: return 'toRecipient';
    case PARTICIPATION.organizer: return 'organizer';
    case PARTICIPATION.optional: return 'optional';
    default: return 'required';
  }
}

async function resolveContactNames(rows: Array<Activityparties & Record<string, unknown>>): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  try {
    const { ContactService } = await import('@/generated/services/contact-service');
    const contacts = await ContactService.getAll();
    return new Map(contacts.map((c) => [c.id, c.fullname || '']));
  } catch {
    return new Map();
  }
}

/**
 * Read attendee participants for an activity.
 * Filters to real attendees (mask 5/6/7) and resolves names from the contacts.
 */
export async function fetchActivityParticipants(activityId: string): Promise<ActivityParticipant[]> {
  if (!activityId) return [];
  try {
    const result = await ActivitypartiesService.getAll({
      filter: `_activityid_value eq ${activityId}`,
    });
    if (!result.success || !result.data) return [];
    const rows = (result.data as unknown as Array<Activityparties & Record<string, unknown>>)
      .filter((r) => r.ispartydeleted !== true)
      .filter((r) => ATTENDEE_MASKS.has(r.participationtypemask as unknown as number))
      .filter((r) => !!(r._partyid_value as string));

    if (rows.length === 0) return [];

    const nameById = await resolveContactNames(rows);

    return rows.map((r): ActivityParticipant => {
      const id = r._partyid_value as string;
      const email = r.addressused;
      return {
        id,
        name: nameById.get(id) || email || id,
        email,
        role: roleFromMask(r.participationtypemask as unknown as number),
      };
    });
  } catch {
    return [];
  }
}

export async function fetchPrimaryActivityContact(activityId: string): Promise<ActivityParticipant | undefined> {
  if (!activityId) return undefined;
  try {
    const result = await ActivitypartiesService.getAll({
      filter: `_activityid_value eq ${activityId}`,
    });
    if (!result.success || !result.data) return undefined;
    const rows = (result.data as unknown as Array<Activityparties & Record<string, unknown>>)
      .filter((r) => r.ispartydeleted !== true)
      .filter((r) => PRIMARY_CONTACT_MASKS.has(r.participationtypemask as unknown as number))
      .filter((r) => !!(r._partyid_value as string));

    const preferred = rows.find((r) => (r.participationtypemask as unknown as number) === PARTICIPATION.toRecipient) ?? rows[0];
    if (!preferred) return undefined;

    const nameById = await resolveContactNames([preferred]);
    const id = preferred._partyid_value as string;
    const email = preferred.addressused;
    return {
      id,
      name: nameById.get(id) || email || id,
      email,
      role: roleFromMask(preferred.participationtypemask as unknown as number),
    };
  } catch {
    return undefined;
  }
}
