/**
 * Field service domain model.
 *
 * Expressed in business terms and deliberately aligned with standard Field
 * Service semantics (work order, promised window, booking), so that a Dynamics
 * 365 Field Service adapter stays a thin mapping rather than a translation
 * layer. A custom-table backend maps onto the same shapes.
 */

export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'emergency';

export type WorkOrderStatus =
  | 'unscheduled'
  | 'scheduled'
  | 'travelling'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface ServiceAddress {
  line1: string;
  city?: string;
  postalCode?: string;
  /** Absent when the address has not been geocoded — routing must degrade, not guess. */
  location?: GeoPoint;
}

export interface WorkOrderSummary {
  id: string;
  /** Human-facing work order number. */
  number: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  /** What kind of job this is (drives the questionnaire later). */
  incidentType?: string;
  customerId: string;
  customerName: string;
  address: ServiceAddress;
  /** Committed completion time. The SLA clock the dashboard sorts on. */
  slaDueBy?: string;
  /** Arrival window promised to the customer. */
  promisedWindowStart?: string;
  promisedWindowEnd?: string;
  /** The technician's own planned slot, when scheduled. */
  scheduledStart?: string;
  scheduledEnd?: string;
  estimatedDurationMinutes?: number;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  summary?: string;
  instructions?: string;
  assetId?: string;
  assetName?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface DateRange {
  from: string;
  to: string;
}

/** The technician's working day, in local time. */
export function todayRange(now: Date = new Date()): DateRange {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(-1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Work still owed to the customer. A closed job remains an assignment in the
 * record, so "outstanding" is a domain judgement rather than something the
 * repository should decide for every caller.
 */
export function isOutstanding(workOrder: Pick<WorkOrderSummary, 'status'>): boolean {
  return workOrder.status !== 'completed' && workOrder.status !== 'cancelled';
}

/**
 * Whether the job can be placed on a map at all. An address that was never
 * geocoded has no position, and inventing one would be worse than admitting it.
 */
export function hasCoordinates<T extends { address: ServiceAddress }>(
  workOrder: T,
): workOrder is T & { address: ServiceAddress & { location: GeoPoint } } {
  return workOrder.address.location !== undefined;
}

/**
 * Work the technician has already committed to and is physically occupied by —
 * travelling to a site counts, because they cannot be somewhere else.
 */
export function isUnderway(workOrder: Pick<WorkOrderSummary, 'status'>): boolean {
  return workOrder.status === 'in-progress' || workOrder.status === 'travelling';
}

/**
 * The single job under way, if any.
 *
 * One technician can only be doing one thing, so the app treats a second start
 * as a mistake rather than a choice. The earliest one wins if a backend ever
 * reports several, since that is the one already reflected in the field.
 */
export function activeWorkOrder<T extends Pick<WorkOrderSummary, 'status' | 'scheduledStart'>>(
  workOrders: readonly T[],
): T | undefined {
  const underway = workOrders.filter(isUnderway);
  if (underway.length <= 1) return underway[0];
  return [...underway].sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''))[0];
}

export type StartRefusal = 'already-underway' | 'another-underway' | 'closed';
/**
 * Why this job cannot be started now, or null when it can.
 *
 * Stated as a reason rather than a boolean so the screen can explain itself
 * instead of presenting a dead button.
 */
export function startRefusal<T extends Pick<WorkOrderSummary, 'id' | 'status'>>(
  workOrder: T,
  active: Pick<WorkOrderSummary, 'id'> | undefined,
): StartRefusal | null {
  if (!isOutstanding(workOrder)) return 'closed';
  if (active?.id === workOrder.id) return 'already-underway';
  return active ? 'another-underway' : null;
}
