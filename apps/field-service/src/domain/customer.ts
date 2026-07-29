/**
 * Customer context a technician needs before arriving.
 *
 * Kept separate from the work order because it outlives any single job: the
 * capture flow later proposes updates to exactly these fields (the "customer
 * 360" half of a visit).
 */

export interface CustomerContact {
  name: string;
  role?: string;
  phone?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  industry?: string;
  /** How to get on site: gate, badge, parking, escort rules. */
  siteAccessNotes?: string;
  /** Standing cautions that apply to every visit here. */
  cautions?: string[];
  contacts: CustomerContact[];
}

export interface ServiceHistoryEntry {
  id: string;
  workOrderNumber: string;
  completedOn: string;
  incidentType: string;
  /** What was actually done, in the technician's words. */
  resolution: string;
  technicianName?: string;
  assetName?: string;
}
