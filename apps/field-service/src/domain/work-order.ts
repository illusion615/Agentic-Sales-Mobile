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

/**
 * Work still owed to the customer. A closed job remains an assignment in the
 * record, so "outstanding" is a domain judgement rather than something the
 * repository should decide for every caller.
 */
export function isOutstanding(workOrder: Pick<WorkOrderSummary, 'status'>): boolean {
  return workOrder.status !== 'completed' && workOrder.status !== 'cancelled';
}
