/**
 * Activity abstraction model — maps to native Dataverse activity tables.
 *
 * Underlying tables: appointment (visit/meeting), phonecall (call), email (email).
 * The adapter layer (activity-service.ts) handles multi-table routing.
 *
 * Removed fields:
 *   - draftStatus → use native statecode (Open/Completed/Canceled)
 *   - outcome → captured in notes/description
 */
import type { Account } from './account-model';
import type { Contact } from './contact-model';
import type { Opportunity } from './opportunity-model';

/** Activity type maps to native Dataverse tables */
export type ActivityType = 'visit' | 'call' | 'meeting' | 'email';

export interface Activity {
  /** GUID primary key (activityid in Dataverse) */
  id: string;
  /** Subject */
  title: string;
  /** Type — determines which native table this record lives in */
  type: ActivityType;
  /** Related account (from regardingobjectid or via opportunity) */
  account?: Pick<Account, 'id' | 'name1'>;
  /** Primary related contact (first attendee). Derived from `contacts[0]` for backward compat. */
  contact?: Pick<Contact, 'id' | 'fullname'>;
  /**
   * All participants (from Activity Party). For visit/meeting these are the
   * attendees; each carries the email alias used and participation role.
   * Lazily populated — list queries may omit this; detail/edit paths fill it.
   */
  contacts?: Array<{
    id: string;
    fullname: string;
    email?: string;
    role?: 'required' | 'optional' | 'organizer' | 'customer';
  }>;
  /** Related opportunity (from regardingobjectid) */
  opportunity?: Pick<Opportunity, 'id' | 'name1'>;
  /** Notes / description */
  notes?: string;
  /** Scheduled start as an ISO instant (maps to scheduledstart; carries time-of-day) */
  scheduleddate: string;
  /** Planned duration in minutes (maps to scheduleddurationminutes; default 60) */
  durationMinutes?: number;
  /** Status: 'open' | 'completed' | 'canceled' (from statecode) */
  status: 'open' | 'completed' | 'canceled';
  /** Owner ID */
  ownerid: string;
  /** Created on */
  createdon?: string;
}

export const _Activity = 'Activity' as const;