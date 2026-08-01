import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAY_PLAN_SETTINGS,
  overtimeMinutes,
  planDay,
  type RoadTravel,
} from '@/domain/day-plan';
import type { GeoPoint, WorkOrderSummary } from '@/domain/work-order';

/** Local 09:00 on a fixed day, so wall-clock assertions are stable. */
const NOW = new Date(2026, 6, 29, 9, 0, 0);

const ORIGIN: GeoPoint = { latitude: 22.5431, longitude: 114.0579 };

function workOrder(
  id: string,
  overrides: Partial<WorkOrderSummary> = {},
): WorkOrderSummary {
  return {
    id,
    number: id.toUpperCase(),
    status: 'scheduled',
    priority: 'normal',
    customerId: 'acc',
    customerName: 'Customer',
    address: { line1: 'somewhere', location: { latitude: 22.55, longitude: 114.06 } },
    estimatedDurationMinutes: 60,
    ...overrides,
  };
}

const stops = (...items: WorkOrderSummary[]) => items.map((workOrder) => ({ workOrder }));

/** Every leg takes half an hour and five kilometres. */
const fixedRoad = (): RoadTravel => ({ distanceMetres: 5_000, durationSeconds: 1_800 });

describe('planDay', () => {
  it('charges the day for travel, work and per-stop overhead', () => {
    const plan = planDay(stops(workOrder('a')), {
      origin: ORIGIN,
      now: NOW,
      roadTravel: fixedRoad,
    });

    const [stop] = plan.stops;
    expect(stop.travel).toEqual({ minutes: 30, km: 5, source: 'road' });
    expect(stop.arrival.getHours()).toBe(9);
    expect(stop.arrival.getMinutes()).toBe(34);
    expect(stop.travelBufferMinutes).toBe(4.5);
    // 60 minutes on site plus the 15 minute parking/paperwork buffer.
    expect(stop.departure.getHours()).toBe(10);
    expect(stop.departure.getMinutes()).toBe(49);
    expect(plan.totals.travelMinutes).toBe(30);
    expect(plan.totals.bufferMinutes).toBe(15);
  });

  it('does not assume a long list fits in one day', () => {
    const many = Array.from({ length: 9 }, (_, index) => workOrder(`wo-${index}`));
    const plan = planDay(stops(...many), {
      origin: ORIGIN,
      now: NOW,
      roadTravel: fixedRoad,
    });

    // 9 x (30 travel + 60 on site + 15 buffer) plus a break far exceeds 09:00–18:00.
    expect(plan.stops).toHaveLength(9);
    expect(plan.completable.length).toBeLessThan(9);
    expect(plan.overflow.length).toBeGreaterThan(0);
    expect(overtimeMinutes(plan)).toBeGreaterThan(0);
  });

  it('takes the break once, at the first stop after it falls due', () => {
    const plan = planDay(stops(workOrder('a'), workOrder('b'), workOrder('c')), {
      origin: ORIGIN,
      now: NOW,
      roadTravel: fixedRoad,
    });

    expect(plan.totals.breakMinutes).toBe(DEFAULT_DAY_PLAN_SETTINGS.breakMinutes);
  });

  it('marks estimated travel as an estimate rather than passing it off as road time', () => {
    const plan = planDay(stops(workOrder('a')), { origin: ORIGIN, now: NOW });

    expect(plan.stops[0].travel.source).toBe('estimate');
    expect(plan.travelConfidence).toBe('estimate');
    expect(plan.stops[0].travel.minutes).toBeGreaterThan(0);
  });

  it('degrades to unknown travel for a job that was never geocoded', () => {
    const plan = planDay(stops(workOrder('a', { address: { line1: 'no coordinates' } })), {
      origin: ORIGIN,
      now: NOW,
      roadTravel: fixedRoad,
    });

    expect(plan.stops[0].travel).toEqual({ minutes: 0, km: 0, source: 'unknown' });
    expect(plan.travelConfidence).toBe('unknown');
  });

  it('never plans a day that has already started from its nominal start', () => {
    const afternoon = new Date(2026, 6, 29, 15, 0, 0);
    const plan = planDay(stops(workOrder('a')), {
      origin: ORIGIN,
      now: afternoon,
      roadTravel: fixedRoad,
    });

    expect(plan.stops[0].arrival.getHours()).toBe(15);
    expect(plan.stops[0].arrival.getMinutes()).toBe(34);
  });

  it('flags a stop whose projected finish misses its commitment', () => {
    const dueSoon = new Date(2026, 6, 29, 9, 30, 0).toISOString();
    const plan = planDay(stops(workOrder('a', { slaDueBy: dueSoon })), {
      origin: ORIGIN,
      now: NOW,
      roadTravel: fixedRoad,
    });

    expect(plan.stops[0].risk).toBe('sla-breached');
  });

  it('flags a stop that overruns the promised arrival window', () => {
    const windowEnd = new Date(2026, 6, 29, 10, 0, 0).toISOString();
    const plan = planDay(stops(workOrder('a', { promisedWindowEnd: windowEnd })), {
      origin: ORIGIN,
      now: NOW,
      roadTravel: fixedRoad,
    });

    expect(plan.stops[0].risk).toBe('misses-window');
  });

  it('returns an empty, honest plan for an empty day', () => {
    const plan = planDay([], { origin: ORIGIN, now: NOW });

    expect(plan.stops).toHaveLength(0);
    expect(plan.overflow).toHaveLength(0);
    expect(overtimeMinutes(plan)).toBe(0);
  });
});
