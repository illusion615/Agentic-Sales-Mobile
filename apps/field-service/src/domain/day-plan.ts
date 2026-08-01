/**
 * Whether today's outstanding work actually fits in today.
 *
 * A visit order is not a schedule: nine jobs in a list say nothing about
 * whether one technician can finish them. This module turns an ordered list of
 * stops into wall-clock arrival and departure times by charging the day for the
 * three things that actually consume it — driving between stops, working on
 * site, and the per-stop overhead nobody books (parking, walking in, paperwork)
 * — then reports what falls off the end of the shift.
 *
 * Pure domain logic. Road travel is supplied by the caller so this stays
 * testable and works identically whether real driving times are available or
 * not; when they are not, travel is openly marked as an estimate rather than
 * silently guessed.
 */
import type { GeoPoint, WorkOrderSummary } from './work-order';
import { assessSla, distanceKm, type SlaState, type SlaThresholds } from './scheduling';

/** A real road leg, as returned by a routing service. */
export interface RoadTravel {
  distanceMetres: number;
  durationSeconds: number;
}

/** Returns road travel for a leg, or undefined when it is not known yet. */
export type RoadTravelLookup = (from: GeoPoint, to: GeoPoint) => RoadTravel | undefined;

export interface DayPlanSettings {
  /** Shift start, minutes from local midnight. */
  dayStartMinutes: number;
  /** Shift end, minutes from local midnight. */
  dayEndMinutes: number;
  /** Unpaid break taken once, when the plan first crosses this time. */
  breakStartMinutes: number;
  breakMinutes: number;
  /** Parking, walking in and paperwork — real time that no job estimate covers. */
  perStopBufferMinutes: number;
  /** Contingency for traffic variation and route-service uncertainty. */
  travelBufferRatio: number;
  /** Used when a work order carries no estimate of its own. */
  defaultJobMinutes: number;
  /** Straight-line distance is shorter than roads; used only for estimated legs. */
  fallbackDetourFactor: number;
  /** Average door-to-door speed for estimated legs, km/h. */
  fallbackSpeedKmh: number;
}

export const DEFAULT_DAY_PLAN_SETTINGS: DayPlanSettings = {
  dayStartMinutes: 8 * 60 + 30,
  dayEndMinutes: 18 * 60,
  breakStartMinutes: 12 * 60,
  breakMinutes: 45,
  perStopBufferMinutes: 15,
  travelBufferRatio: 0.15,
  defaultJobMinutes: 60,
  fallbackDetourFactor: 1.4,
  fallbackSpeedKmh: 26,
};

export type TravelSource = 'road' | 'estimate' | 'unknown';

export interface PlannedTravel {
  minutes: number;
  km: number;
  /**
   * `road` came from the routing service, `estimate` is straight-line inflated
   * by a detour factor, `unknown` means the stop is not geocoded and the leg
   * could not be costed at all.
   */
  source: TravelSource;
}

export type DayPlanRisk = 'none' | 'sla-breached' | 'finishes-late' | 'misses-window';

export interface DayPlanStop {
  workOrder: WorkOrderSummary;
  slaState: SlaState;
  travel: PlannedTravel;
  /** Wall clock on arrival, after driving and the break. */
  arrival: Date;
  /** Wall clock when the technician can leave, including per-stop buffer. */
  departure: Date;
  onSiteMinutes: number;
  bufferMinutes: number;
  travelBufferMinutes: number;
  /** True when the stop still finishes inside the shift. */
  fitsInDay: boolean;
  risk: DayPlanRisk;
}

export interface DayPlanTotals {
  travelMinutes: number;
  onSiteMinutes: number;
  bufferMinutes: number;
  travelBufferMinutes: number;
  breakMinutes: number;
  travelKm: number;
  /** Time the plan consumes end to end. */
  committedMinutes: number;
  /** Time the shift still has from the planning cursor onwards. */
  availableMinutes: number;
}

export interface DayPlan {
  stops: DayPlanStop[];
  /** Stops that finish before the shift ends. */
  completable: DayPlanStop[];
  /** Stops that do not — these need rescheduling or a second technician. */
  overflow: DayPlanStop[];
  totals: DayPlanTotals;
  /** Worst source used across legs; drives how confidently the plan is worded. */
  travelConfidence: TravelSource;
  /** Projected finish of the last stop, even when it runs past the shift. */
  projectedFinish: Date;
  shiftEnd: Date;
}

export interface DayPlanContext {
  /** Where the technician starts the day. */
  origin?: GeoPoint;
  /** Planning clock; the day never starts earlier than this. */
  now?: Date;
  settings?: DayPlanSettings;
  roadTravel?: RoadTravelLookup;
  thresholds?: SlaThresholds;
}

function atMinutes(day: Date, minutes: number): Date {
  const date = new Date(day);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutes);
  return date;
}

function estimateTravel(from: GeoPoint, to: GeoPoint, settings: DayPlanSettings): PlannedTravel {
  const km = distanceKm(from, to) * settings.fallbackDetourFactor;
  return {
    km,
    minutes: (km / settings.fallbackSpeedKmh) * 60,
    source: 'estimate',
  };
}

function travelFor(
  from: GeoPoint | undefined,
  to: GeoPoint | undefined,
  context: Required<Pick<DayPlanContext, 'settings'>> & Pick<DayPlanContext, 'roadTravel'>,
): PlannedTravel {
  if (!from || !to) return { minutes: 0, km: 0, source: 'unknown' };

  const road = context.roadTravel?.(from, to);
  if (road) {
    return {
      minutes: road.durationSeconds / 60,
      km: road.distanceMetres / 1000,
      source: 'road',
    };
  }
  return estimateTravel(from, to, context.settings);
}

const CONFIDENCE_RANK: Record<TravelSource, number> = { unknown: 0, estimate: 1, road: 2 };

function riskFor(
  workOrder: WorkOrderSummary,
  slaState: SlaState,
  departure: Date,
  fitsInDay: boolean,
): DayPlanRisk {
  if (slaState === 'breached') return 'sla-breached';
  if (workOrder.slaDueBy && departure.getTime() > new Date(workOrder.slaDueBy).getTime()) {
    return 'sla-breached';
  }
  if (
    workOrder.promisedWindowEnd &&
    departure.getTime() > new Date(workOrder.promisedWindowEnd).getTime()
  ) {
    return 'misses-window';
  }
  return fitsInDay ? 'none' : 'finishes-late';
}

/**
 * Cost an ordered list of stops against the working day.
 *
 * The order is taken as given — this answers "does this plan fit?", it does not
 * reorder to make it fit. Stops past the shift end are still timed so the
 * overflow is quantified rather than merely flagged.
 */
export function planDay(
  stops: readonly { workOrder: WorkOrderSummary }[],
  context: DayPlanContext = {},
): DayPlan {
  const settings = context.settings ?? DEFAULT_DAY_PLAN_SETTINGS;
  const now = context.now ?? new Date();
  const shiftStart = atMinutes(now, settings.dayStartMinutes);
  const shiftEnd = atMinutes(now, settings.dayEndMinutes);
  const breakStart = atMinutes(now, settings.breakStartMinutes);

  // A day already under way cannot be planned from its nominal start.
  let cursor = new Date(Math.max(shiftStart.getTime(), now.getTime()));
  const planningStart = new Date(cursor);
  let breakTaken = cursor.getTime() >= breakStart.getTime() + settings.breakMinutes * 60_000;

  let position = context.origin;
  let confidence: TravelSource = 'road';
  const planned: DayPlanStop[] = [];
  const totals: DayPlanTotals = {
    travelMinutes: 0,
    onSiteMinutes: 0,
    bufferMinutes: 0,
    travelBufferMinutes: 0,
    breakMinutes: 0,
    travelKm: 0,
    committedMinutes: 0,
    availableMinutes: Math.max(0, (shiftEnd.getTime() - cursor.getTime()) / 60_000),
  };

  for (const stop of stops) {
    const workOrder = stop.workOrder;
    const destination = workOrder.address.location;
    const travel = travelFor(position, destination, { settings, roadTravel: context.roadTravel });
    if (CONFIDENCE_RANK[travel.source] < CONFIDENCE_RANK[confidence]) confidence = travel.source;

    const travelBufferMinutes = travel.minutes * settings.travelBufferRatio;
    cursor = new Date(cursor.getTime() + (travel.minutes + travelBufferMinutes) * 60_000);

    // The break is taken once, at the first opportunity after it falls due.
    if (!breakTaken && cursor.getTime() >= breakStart.getTime()) {
      cursor = new Date(cursor.getTime() + settings.breakMinutes * 60_000);
      totals.breakMinutes += settings.breakMinutes;
      breakTaken = true;
    }

    const arrival = new Date(cursor);
    const onSiteMinutes = workOrder.estimatedDurationMinutes ?? settings.defaultJobMinutes;
    const bufferMinutes = settings.perStopBufferMinutes;
    const departure = new Date(cursor.getTime() + (onSiteMinutes + bufferMinutes) * 60_000);
    cursor = departure;

    const fitsInDay = departure.getTime() <= shiftEnd.getTime();
    const slaState = assessSla(workOrder, now, context.thresholds).state;

    planned.push({
      workOrder,
      slaState,
      travel,
      arrival,
      departure,
      onSiteMinutes,
      bufferMinutes,
      travelBufferMinutes,
      fitsInDay,
      risk: riskFor(workOrder, slaState, departure, fitsInDay),
    });

    totals.travelMinutes += travel.minutes;
    totals.travelBufferMinutes += travelBufferMinutes;
    totals.travelKm += travel.km;
    totals.onSiteMinutes += onSiteMinutes;
    totals.bufferMinutes += bufferMinutes;

    position = destination ?? position;
  }

  totals.committedMinutes = (cursor.getTime() - planningStart.getTime()) / 60_000;

  return {
    stops: planned,
    completable: planned.filter((stop) => stop.fitsInDay),
    overflow: planned.filter((stop) => !stop.fitsInDay),
    totals,
    travelConfidence: planned.length === 0 ? 'road' : confidence,
    projectedFinish: cursor,
    shiftEnd,
  };
}

/** Minutes the plan runs past the shift; zero when everything fits. */
export function overtimeMinutes(plan: DayPlan): number {
  return Math.max(0, (plan.projectedFinish.getTime() - plan.shiftEnd.getTime()) / 60_000);
}
