/**
 * Pre-visit briefing.
 *
 * The point is preparation, not prose: a technician reading this on the way
 * should learn what happened here before, what to watch out for, and what to
 * bring. Everything is grounded in the work order, the customer profile and the
 * service history — a provider must not introduce facts that are not in its
 * input.
 */
import type { CustomerProfile, ServiceHistoryEntry } from './customer';
import type { WorkOrderDetail } from './work-order';

export interface BriefingContext {
  workOrder: WorkOrderDetail;
  customer: CustomerProfile;
  history: ServiceHistoryEntry[];
}

export interface Briefing {
  /** Two or three sentences of background. */
  background: string;
  /** Site rules, access constraints, standing cautions. */
  watchOuts: string[];
  /** Concrete things to prepare or bring. */
  preparation: string[];
}

/** Repeat visits for the same fault are the strongest signal in the history. */
export function recurringIncidents(
  history: readonly ServiceHistoryEntry[],
  incidentType: string | undefined,
): ServiceHistoryEntry[] {
  if (!incidentType) return [];
  return history.filter((entry) => entry.incidentType === incidentType);
}

/** Most recent first; the briefing only ever needs the last few. */
export function recentFirst(history: readonly ServiceHistoryEntry[]): ServiceHistoryEntry[] {
  return [...history].sort(
    (a, b) => new Date(b.completedOn).getTime() - new Date(a.completedOn).getTime(),
  );
}
