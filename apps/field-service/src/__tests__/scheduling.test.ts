import { describe, expect, it } from 'vitest';
import {
  assessSla,
  distanceKm,
  sortWorkOrders,
  suggestVisitOrder,
} from '@/domain/scheduling';
import type { WorkOrderSummary } from '@/domain/work-order';

const NOW = new Date('2026-07-29T09:00:00.000Z');

function workOrder(overrides: Partial<WorkOrderSummary> & { id: string }): WorkOrderSummary {
  return {
    number: overrides.id.toUpperCase(),
    status: 'scheduled',
    priority: 'normal',
    customerId: 'acc',
    customerName: 'Customer',
    address: { line1: 'somewhere' },
    ...overrides,
  };
}

const hoursFrom = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

describe('assessSla', () => {
  it('reports a missing commitment rather than inventing one', () => {
    expect(assessSla(workOrder({ id: 'a' }), NOW)).toEqual({ state: 'none', minutesRemaining: null });
  });

  it('grades remaining time into breached, critical, at-risk and ok', () => {
    const states = [-1, 1, 5, 24].map(
      (h) => assessSla(workOrder({ id: 'a', slaDueBy: hoursFrom(h) }), NOW).state,
    );
    expect(states).toEqual(['breached', 'critical', 'at-risk', 'ok']);
  });

  it('reports how far past due a breached order is', () => {
    const { minutesRemaining } = assessSla(workOrder({ id: 'a', slaDueBy: hoursFrom(-2) }), NOW);
    expect(minutesRemaining).toBe(-120);
  });
});

describe('sortWorkOrders', () => {
  const breached = workOrder({ id: 'breached', slaDueBy: hoursFrom(-1) });
  const ok = workOrder({ id: 'ok', slaDueBy: hoursFrom(20) });
  const critical = workOrder({ id: 'critical', slaDueBy: hoursFrom(1) });
  const noSla = workOrder({ id: 'no-sla' });

  it('puts the most urgent first and unbounded work last', () => {
    const order = sortWorkOrders([ok, noSla, breached, critical], 'sla', { now: NOW }).map((w) => w.id);
    expect(order).toEqual(['breached', 'critical', 'ok', 'no-sla']);
  });

  it('does not mutate the input', () => {
    const input = [ok, breached];
    sortWorkOrders(input, 'sla', { now: NOW });
    expect(input.map((w) => w.id)).toEqual(['ok', 'breached']);
  });

  it('ranks by priority before falling back to the SLA clock', () => {
    const order = sortWorkOrders(
      [
        workOrder({ id: 'low', priority: 'low' }),
        workOrder({ id: 'emergency', priority: 'emergency' }),
        workOrder({ id: 'high', priority: 'high' }),
      ],
      'priority',
      { now: NOW },
    ).map((w) => w.id);
    expect(order).toEqual(['emergency', 'high', 'low']);
  });

  it('sinks ungeocoded work when sorting by distance instead of guessing a position', () => {
    const near = workOrder({ id: 'near', address: { line1: 'near', location: { latitude: 22.54, longitude: 114.06 } } });
    const far = workOrder({ id: 'far', address: { line1: 'far', location: { latitude: 23.5, longitude: 115.0 } } });
    const unknown = workOrder({ id: 'unknown' });

    const order = sortWorkOrders([far, unknown, near], 'distance', {
      now: NOW,
      origin: { latitude: 22.5431, longitude: 114.0579 },
    }).map((w) => w.id);

    expect(order).toEqual(['near', 'far', 'unknown']);
  });
});

describe('distanceKm', () => {
  it('measures a known separation', () => {
    const km = distanceKm({ latitude: 22.5431, longitude: 114.0579 }, { latitude: 22.5333, longitude: 113.9301 });
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(20);
  });
});

describe('suggestVisitOrder', () => {
  const origin = { latitude: 22.5431, longitude: 114.0579 };

  it('never lets a travel saving overtake a more urgent commitment', () => {
    // The breached job is the furthest away, so a pure nearest-neighbour route
    // would visit it last.
    const breachedFar = workOrder({
      id: 'breached-far',
      slaDueBy: hoursFrom(-1),
      address: { line1: 'far', location: { latitude: 23.5, longitude: 115.0 } },
    });
    const okNear = workOrder({
      id: 'ok-near',
      slaDueBy: hoursFrom(20),
      address: { line1: 'near', location: { latitude: 22.544, longitude: 114.058 } },
    });

    const plan = suggestVisitOrder([okNear, breachedFar], { now: NOW, origin });
    expect(plan.map((s) => s.workOrder.id)).toEqual(['breached-far', 'ok-near']);
    expect(plan[0].slaState).toBe('breached');
  });

  it('takes the nearest job first among equally urgent ones', () => {
    const near = workOrder({
      id: 'near',
      slaDueBy: hoursFrom(20),
      address: { line1: 'near', location: { latitude: 22.544, longitude: 114.058 } },
    });
    const far = workOrder({
      id: 'far',
      slaDueBy: hoursFrom(20),
      address: { line1: 'far', location: { latitude: 22.7, longitude: 114.3 } },
    });

    const plan = suggestVisitOrder([far, near], { now: NOW, origin });
    expect(plan.map((s) => s.workOrder.id)).toEqual(['near', 'far']);
    expect(plan[0].legKm).toBeLessThan(plan[1].legKm!);
  });

  it('still plans every stop when coordinates are missing', () => {
    const plan = suggestVisitOrder(
      [workOrder({ id: 'a', slaDueBy: hoursFrom(5) }), workOrder({ id: 'b', slaDueBy: hoursFrom(2) })],
      { now: NOW, origin },
    );
    expect(plan.map((s) => s.workOrder.id)).toEqual(['b', 'a']);
    expect(plan.every((s) => s.legKm === null)).toBe(true);
  });
});
