/**
 * SLA assessment, sorting and visit-order planning.
 *
 * Pure domain logic: it depends on the model, never on a data source. This is
 * the part of the dashboard that must behave identically whichever backend is
 * configured, which is why it lives here rather than in a repository.
 */
import type { GeoPoint, TimeSlot, WorkOrderSummary } from './work-order';

export type SlaState = 'breached' | 'critical' | 'at-risk' | 'ok' | 'none';

export interface SlaThresholds {
  /** Below this many minutes remaining, the job is critical. */
  criticalMinutes: number;
  /** Below this many minutes remaining, the job is at risk. */
  atRiskMinutes: number;
}

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  criticalMinutes: 120,
  atRiskMinutes: 480,
};

export interface SlaAssessment {
  state: SlaState;
  /** Null when the work order carries no SLA commitment. */
  minutesRemaining: number | null;
}

/** Rank used for ordering; lower is more urgent. */
const STATE_RANK: Record<SlaState, number> = {
  breached: 0,
  critical: 1,
  'at-risk': 2,
  ok: 3,
  none: 4,
};

export function assessSla(
  workOrder: Pick<WorkOrderSummary, 'slaDueBy'>,
  now: Date = new Date(),
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS,
): SlaAssessment {
  if (!workOrder.slaDueBy) return { state: 'none', minutesRemaining: null };
  const due = new Date(workOrder.slaDueBy).getTime();
  if (Number.isNaN(due)) return { state: 'none', minutesRemaining: null };

  const minutesRemaining = Math.round((due - now.getTime()) / 60_000);
  if (minutesRemaining < 0) return { state: 'breached', minutesRemaining };
  if (minutesRemaining < thresholds.criticalMinutes) return { state: 'critical', minutesRemaining };
  if (minutesRemaining < thresholds.atRiskMinutes) return { state: 'at-risk', minutesRemaining };
  return { state: 'ok', minutesRemaining };
}

/** How many jobs sit in each SLA state; the legend counts the map is read by. */
export function slaBreakdown(
  workOrders: readonly Pick<WorkOrderSummary, 'slaDueBy'>[],
  now: Date = new Date(),
  thresholds: SlaThresholds = DEFAULT_SLA_THRESHOLDS,
): Record<SlaState, number> {
  const counts: Record<SlaState, number> = {
    breached: 0,
    critical: 0,
    'at-risk': 0,
    ok: 0,
    none: 0,
  };
  for (const workOrder of workOrders) {
    counts[assessSla(workOrder, now, thresholds).state] += 1;
  }
  return counts;
}

/** Great-circle distance in kilometres. */export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const PRIORITY_RANK: Record<WorkOrderSummary['priority'], number> = {
  emergency: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type SortMode = 'sla' | 'promised' | 'distance' | 'priority';

export interface SortContext {
  now?: Date;
  /** Where the technician is starting from; required for distance sorting. */
  origin?: GeoPoint;
  thresholds?: SlaThresholds;
}

/** Missing values sort last rather than pretending to be zero. */
function byTime(a: string | undefined, b: string | undefined): number {
  if (a && b) return new Date(a).getTime() - new Date(b).getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function originDistance(w: WorkOrderSummary, origin?: GeoPoint): number | null {
  if (!origin || !w.address.location) return null;
  return distanceKm(origin, w.address.location);
}

/** Sort a copy of the list along one explicit dimension. */
export function sortWorkOrders(
  items: readonly WorkOrderSummary[],
  mode: SortMode,
  context: SortContext = {},
): WorkOrderSummary[] {
  const now = context.now ?? new Date();
  const list = [...items];

  switch (mode) {
    case 'sla':
      return list.sort((a, b) => {
        const sa = assessSla(a, now, context.thresholds);
        const sb = assessSla(b, now, context.thresholds);
        const rank = STATE_RANK[sa.state] - STATE_RANK[sb.state];
        if (rank !== 0) return rank;
        return byTime(a.slaDueBy, b.slaDueBy);
      });

    case 'promised':
      return list.sort((a, b) => byTime(a.promisedWindowStart, b.promisedWindowStart));

    case 'priority':
      return list.sort((a, b) => {
        const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        return rank !== 0 ? rank : byTime(a.slaDueBy, b.slaDueBy);
      });

    case 'distance':
      return list.sort((a, b) => {
        const da = originDistance(a, context.origin);
        const db = originDistance(b, context.origin);
        if (da === null && db === null) return 0;
        if (da === null) return 1; // ungeocoded jobs sink to the bottom
        if (db === null) return -1;
        return da - db;
      });
  }
}

export interface PlannedStop {
  workOrder: WorkOrderSummary;
  slaState: SlaState;
  /** Great-circle distance from the previous stop; never a road distance. */
  straightLineKm: number | null;
}

/**
 * Propose a visit order, not a road route.
 *
 * Urgency wins over travel: jobs are grouped into SLA tiers and a tier is fully
 * served before the next one, so proximity can never push a job past its
 * commitment. Within a tier the nearest coordinate is taken next using
 * great-circle distance. This does not know the road network, traffic or
 * turn restrictions and must never be rendered or labelled as a driving route.
 *
 * This proposes only. Whether the technician may commit it depends on
 * `capabilities.selfScheduling`.
 */
export function suggestVisitOrder(
  items: readonly WorkOrderSummary[],
  context: SortContext = {},
): PlannedStop[] {
  const now = context.now ?? new Date();
  const tiers = new Map<number, WorkOrderSummary[]>();

  for (const item of items) {
    const { state } = assessSla(item, now, context.thresholds);
    const rank = STATE_RANK[state];
    const bucket = tiers.get(rank);
    if (bucket) bucket.push(item);
    else tiers.set(rank, [item]);
  }

  const plan: PlannedStop[] = [];
  let cursor = context.origin;

  for (const rank of [...tiers.keys()].sort((a, b) => a - b)) {
    const remaining = [...(tiers.get(rank) ?? [])];

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestKm: number | null = null;

      if (cursor) {
        for (let i = 0; i < remaining.length; i++) {
          const km = originDistance(remaining[i], cursor);
          if (km === null) continue;
          if (bestKm === null || km < bestKm) {
            bestKm = km;
            bestIndex = i;
          }
        }
      }
      // With no usable coordinates the tier keeps its incoming order, which is
      // already SLA-ordered upstream.
      if (bestKm === null) {
        remaining.sort((a, b) => byTime(a.slaDueBy, b.slaDueBy));
        bestIndex = 0;
      }

      const [next] = remaining.splice(bestIndex, 1);
      plan.push({
        workOrder: next,
        slaState: assessSla(next, now, context.thresholds).state,
        straightLineKm: bestKm,
      });
      cursor = next.address.location ?? cursor;
    }
  }

  return plan;
}

/** Durations a technician can commit to from the card, in minutes. */
export const SLOT_DURATION_CHOICES = [30, 60, 90, 120, 180, 240] as const;

export const DEFAULT_SLOT_DURATION_MINUTES = 60;

export interface SlotDraft {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Local wall-clock start, `HH:mm`. */
  time: string;
  durationMinutes: number;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * What the reschedule control should open on: the slot the job already has,
 * failing that the window promised to the customer, failing that the next whole
 * hour. Never a blank form — the technician is on site, not at a desk.
 */
export function slotDraftFor(
  workOrder: Pick<
    WorkOrderSummary,
    'scheduledStart' | 'scheduledEnd' | 'promisedWindowStart' | 'estimatedDurationMinutes'
  >,
  now: Date = new Date(),
): SlotDraft {
  const anchor = workOrder.scheduledStart ?? workOrder.promisedWindowStart;
  const start = anchor ? new Date(anchor) : null;
  const valid = start && !Number.isNaN(start.getTime()) ? start : nextWholeHour(now);

  const scheduledMinutes =
    workOrder.scheduledStart && workOrder.scheduledEnd
      ? Math.round(
          (new Date(workOrder.scheduledEnd).getTime() - new Date(workOrder.scheduledStart).getTime()) /
            60_000,
        )
      : null;

  const duration =
    scheduledMinutes && scheduledMinutes > 0
      ? scheduledMinutes
      : workOrder.estimatedDurationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;

  return {
    date: `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}`,
    time: `${pad(valid.getHours())}:${pad(valid.getMinutes())}`,
    durationMinutes: duration,
  };
}

function nextWholeHour(now: Date): Date {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

/**
 * Turn the draft into a committed slot. Returns null for input the control
 * could not produce a real time from, so a half-filled form can never be saved
 * as an appointment.
 */
export function buildTimeSlot(draft: SlotDraft): TimeSlot | null {
  const [year, month, day] = draft.date.split('-').map(Number);
  const [hour, minute] = draft.time.split(':').map(Number);
  if ([year, month, day, hour, minute].some((part) => !Number.isFinite(part))) return null;
  if (draft.durationMinutes <= 0) return null;

  // Local time on purpose: the appointment is a wall-clock commitment on site.
  const start = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(start.getTime())) return null;

  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + draft.durationMinutes * 60_000).toISOString(),
  };
}
